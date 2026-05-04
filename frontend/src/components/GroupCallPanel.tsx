import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { UserResponse } from "../api/auth";
import { lookupUserByEmail } from "../api/users";
import { meetingNotifyWebSocketUrl, meetingRoomWebSocketUrl } from "../meeting/ws";
import { DEFAULT_ICE_SERVERS } from "../webrtc/iceServers";
import { useLocalVideoEffects, type VideoEffectMode } from "../video/useLocalVideoEffects";
import { useCallRing } from "../audio/useCallRing";
import {
  ensureNotificationPermission,
  notificationsSupported,
  showIncomingCallNotification,
} from "../lib/notifications";

type PeerInfo = { userId: string; email: string; displayName: string };

type IncomingCall = {
  callId: string;
  roomId: string;
  fromUserId: string;
  fromEmail: string;
  fromDisplayName: string;
};

type Toast = { id: number; message: string; tone: "info" | "error" | "success" };

function shouldInitiate(myId: string, peerId: string): boolean {
  return myId.localeCompare(peerId) < 0;
}

function PeerTile({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <div className="video-tile meeting-peer-tile">
      <span className="video-label">{label}</span>
      <video ref={ref} autoPlay playsInline className="video-fit" />
    </div>
  );
}

export function GroupCallPanel({ me }: { me: UserResponse }) {
  const [roomId, setRoomId] = useState("");
  const [rawLocal, setRawLocal] = useState<MediaStream | null>(null);
  const rawLocalRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    rawLocalRef.current = rawLocal;
  }, [rawLocal]);

  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState<Record<string, PeerInfo>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [peerEmail, setPeerEmail] = useState("");
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [effectMode, setEffectMode] = useState<VideoEffectMode>("none");
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const bgObjectUrlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (bgObjectUrlRef.current) {
        URL.revokeObjectURL(bgObjectUrlRef.current);
      }
    };
  }, []);

  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [outboundCallId, setOutboundCallId] = useState<string | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const pushToast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  const { displayStream, effectError } = useLocalVideoEffects(rawLocal, effectMode, bgImage);
  const displayStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    displayStreamRef.current = displayStream;
  }, [displayStream]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = displayStream ?? rawLocal ?? null;
    }
  }, [displayStream, rawLocal]);

  const notifyWsRef = useRef<WebSocket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const meIdRef = useRef(me.id);
  meIdRef.current = me.id;

  const { start: ringStart, stop: ringStop } = useCallRing();

  const sendRoom = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const sendNotify = useCallback((payload: unknown) => {
    const ws = notifyWsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const closeAllPeers = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    pendingIceRef.current.clear();
    setRemoteStreams({});
    setParticipants({});
  }, []);

  const flushIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const list = pendingIceRef.current.get(peerId) ?? [];
    pendingIceRef.current.set(peerId, []);
    for (const c of list) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        // ignore
      }
    }
  }, []);

  const getOrCreatePc = useCallback(
    (peerId: string) => {
      let pc = pcsRef.current.get(peerId);
      if (pc) {
        return pc;
      }
      const stream = displayStreamRef.current;
      if (!stream) {
        return null;
      }
      pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
      pcsRef.current.set(peerId, pc);
      stream.getTracks().forEach((t) => pc!.addTrack(t, stream));
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          const j = ev.candidate.toJSON();
          sendRoom({
            kind: "webrtc-ice",
            targetUserId: peerId,
            candidate: j.candidate,
            sdpMid: j.sdpMid,
            sdpMLineIndex: j.sdpMLineIndex,
          });
        }
      };
      pc.ontrack = (ev) => {
        const [remote] = ev.streams;
        if (remote) {
          setRemoteStreams((prev) => ({ ...prev, [peerId]: remote }));
        }
      };
      return pc;
    },
    [sendRoom]
  );

  const createOfferToPeer = useCallback(
    async (peer: PeerInfo) => {
      const myId = meIdRef.current;
      if (!shouldInitiate(myId, peer.userId)) {
        return;
      }
      const pc = getOrCreatePc(peer.userId);
      if (!pc || pc.localDescription?.type === "offer") {
        return;
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendRoom({ kind: "webrtc-offer", targetUserId: peer.userId, sdp: offer.sdp });
    },
    [getOrCreatePc, sendRoom]
  );

  const handleRemoteOffer = useCallback(
    async (fromUserId: string, sdp: string) => {
      const myId = meIdRef.current;
      if (shouldInitiate(myId, fromUserId)) {
        return;
      }
      const pc = getOrCreatePc(fromUserId);
      if (!pc) {
        return;
      }
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendRoom({ kind: "webrtc-answer", targetUserId: fromUserId, sdp: answer.sdp });
      await flushIce(fromUserId, pc);
    },
    [flushIce, getOrCreatePc, sendRoom]
  );

  const handleRemoteAnswer = useCallback(
    async (fromUserId: string, sdp: string) => {
      const myId = meIdRef.current;
      if (!shouldInitiate(myId, fromUserId)) {
        return;
      }
      const pc = pcsRef.current.get(fromUserId);
      if (!pc) {
        return;
      }
      await pc.setRemoteDescription({ type: "answer", sdp });
      await flushIce(fromUserId, pc);
    },
    [flushIce]
  );

  const handleRemoteIce = useCallback(
    async (fromUserId: string, msg: Record<string, unknown>) => {
      const pc = pcsRef.current.get(fromUserId);
      const cand: RTCIceCandidateInit = {
        candidate: msg.candidate as string | undefined,
        sdpMid: msg.sdpMid as string | undefined,
        sdpMLineIndex: msg.sdpMLineIndex as number | undefined,
      };
      if (!pc || !pc.remoteDescription) {
        const q = pendingIceRef.current.get(fromUserId) ?? [];
        q.push(cand);
        pendingIceRef.current.set(fromUserId, q);
        return;
      }
      try {
        await pc.addIceCandidate(cand);
      } catch {
        const q = pendingIceRef.current.get(fromUserId) ?? [];
        q.push(cand);
        pendingIceRef.current.set(fromUserId, q);
      }
    },
    []
  );

  const syncOffersToPeers = useCallback(
    async (peers: PeerInfo[]) => {
      const myId = meIdRef.current;
      for (const p of peers) {
        if (p.userId === myId) {
          continue;
        }
        if (shouldInitiate(myId, p.userId)) {
          await createOfferToPeer(p);
        }
      }
    },
    [createOfferToPeer]
  );

  const signalHandlersRef = useRef({
    handleRemoteOffer,
    handleRemoteAnswer,
    handleRemoteIce,
  });
  signalHandlersRef.current = { handleRemoteOffer, handleRemoteAnswer, handleRemoteIce };

  useEffect(() => {
    if (!joined || !displayStream) {
      return;
    }
    const peers = Object.values(participants).filter((p) => p.userId !== me.id);
    void syncOffersToPeers(peers);
  }, [joined, displayStream, participants, syncOffersToPeers, me.id]);

  useEffect(() => {
    if (!joined || !displayStream) {
      return;
    }
    const v = displayStream.getVideoTracks()[0];
    const a = displayStream.getAudioTracks()[0];
    pcsRef.current.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track?.kind === "video" && v) {
          void sender.replaceTrack(v);
        }
        if (sender.track?.kind === "audio" && a) {
          void sender.replaceTrack(a);
        }
      });
    });
  }, [displayStream, joined]);

  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(meetingNotifyWebSocketUrl());
    } catch {
      return;
    }
    notifyWsRef.current = ws;
    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      const kind = msg.kind as string;
      if (kind === "incoming-call") {
        const inc: IncomingCall = {
          callId: msg.callId as string,
          roomId: msg.roomId as string,
          fromUserId: msg.fromUserId as string,
          fromEmail: msg.fromEmail as string,
          fromDisplayName: msg.fromDisplayName as string,
        };
        setIncoming(inc);
        ringStart();
        showIncomingCallNotification(inc.fromDisplayName, inc.roomId);
        pushToast(`Incoming call from ${inc.fromDisplayName}`, "info");
        return;
      }
      if (kind === "invite-error") {
        setOutboundCallId(null);
        pushToast((msg.message as string) ?? "Invite failed", "error");
        return;
      }
      if (kind === "invite-declined") {
        setOutboundCallId(null);
        pushToast("Call was declined", "info");
        return;
      }
      if (kind === "invite-accepted") {
        setOutboundCallId(null);
        pushToast("Invitee accepted — they are joining the room", "success");
      }
    };
    ws.onerror = () => pushToast("Notify connection error", "error");
    return () => {
      ws.close();
      if (notifyWsRef.current === ws) {
        notifyWsRef.current = null;
      }
    };
  }, [pushToast, ringStart]);

  useEffect(() => {
    if (!incoming) {
      ringStop();
    }
  }, [incoming, ringStop]);

  async function ensureCamera() {
    if (rawLocalRef.current?.getVideoTracks()[0]?.readyState === "live") {
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setRawLocal(stream);
  }

  function attachRoomSocket(id: string) {
    closeAllPeers();
    setParticipants({});
    setRemoteStreams({});
    wsRef.current?.close();

    const ws = new WebSocket(meetingRoomWebSocketUrl(id));
    wsRef.current = ws;

    ws.onopen = () => {
      setJoined(true);
      setStatus("Connected — linking peers…");
      pushToast("You are in the call", "success");
    };

    ws.onmessage = async (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      const kind = msg.kind as string;
      if (kind === "room-roster") {
        const list = (msg.participants as PeerInfo[]) ?? [];
        const map: Record<string, PeerInfo> = {};
        for (const p of list) {
          map[p.userId] = p;
        }
        setParticipants(map);
        return;
      }
      if (kind === "peer-joined") {
        const p: PeerInfo = {
          userId: msg.userId as string,
          email: msg.email as string,
          displayName: msg.displayName as string,
        };
        setParticipants((prev) => ({ ...prev, [p.userId]: p }));
        pushToast(`${p.displayName} joined`, "info");
        return;
      }
      if (kind === "peer-left") {
        const uid = msg.userId as string;
        pcsRef.current.get(uid)?.close();
        pcsRef.current.delete(uid);
        pendingIceRef.current.delete(uid);
        setRemoteStreams((prev) => {
          const n = { ...prev };
          delete n[uid];
          return n;
        });
        setParticipants((prev) => {
          const n = { ...prev };
          delete n[uid];
          return n;
        });
        pushToast("Someone left the call", "info");
        return;
      }
      const from = msg.fromUserId as string;
      const h = signalHandlersRef.current;
      if (kind === "webrtc-offer") {
        await h.handleRemoteOffer(from, msg.sdp as string);
        return;
      }
      if (kind === "webrtc-answer") {
        await h.handleRemoteAnswer(from, msg.sdp as string);
        return;
      }
      if (kind === "webrtc-ice") {
        await h.handleRemoteIce(from, msg);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setJoined(false);
      setStatus("Left room");
    };
    ws.onerror = () => pushToast("Room connection error", "error");
  }

  async function joinRoom() {
    const id = roomId.trim();
    if (id.length < 8) {
      pushToast("Room ID must be at least 8 characters.", "error");
      return;
    }
    setStatus("Starting camera…");
    try {
      await ensureCamera();
    } catch {
      pushToast("Camera or microphone permission denied.", "error");
      return;
    }
    attachRoomSocket(id);
  }

  async function onLookupInvite(e: FormEvent) {
    e.preventDefault();
    setLookupMsg(null);
    try {
      const u = await lookupUserByEmail(peerEmail);
      setLookupMsg(
        u.online
          ? `${u.displayName} is online — ring them or share room ID ${roomId || "(create one)"}.`
          : `${u.displayName} is offline — they need this page open to receive a ring.`
      );
    } catch (err) {
      setLookupMsg(err instanceof Error ? err.message : "Lookup failed");
    }
  }

  async function onRingInvite() {
    const id = roomId.trim();
    if (id.length < 8) {
      pushToast("Set a room ID first (8+ characters).", "error");
      return;
    }
    const email = peerEmail.trim();
    if (!email) {
      pushToast("Enter an email to ring.", "error");
      return;
    }
    if (notificationsSupported() && Notification.permission === "default") {
      await ensureNotificationPermission();
    }
    try {
      const u = await lookupUserByEmail(email);
      if (!u.online) {
        pushToast("That user is offline (they need this app open).", "error");
        return;
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Lookup failed", "error");
      return;
    }
    const callId = crypto.randomUUID();
    setOutboundCallId(callId);
    sendNotify({
      kind: "invite",
      targetEmail: email,
      roomId: id,
      callId,
    });
    pushToast("Ringing…", "info");
  }

  function createNewRoom() {
    const id = crypto.randomUUID();
    setRoomId(id);
    pushToast("New room ID copied to clipboard", "success");
    void navigator.clipboard?.writeText(id).catch(() => undefined);
  }

  function leaveRoom() {
    wsRef.current?.close();
    wsRef.current = null;
    closeAllPeers();
    rawLocalRef.current?.getTracks().forEach((t) => t.stop());
    setRawLocal(null);
    setJoined(false);
    setParticipants({});
    setRemoteStreams({});
    setStatus(null);
    setOutboundCallId(null);
  }

  async function acceptIncoming() {
    if (!incoming) {
      return;
    }
    ringStop();
    const inc = incoming;
    setIncoming(null);
    sendNotify({ kind: "invite-accepted", callId: inc.callId });
    setRoomId(inc.roomId);
    setStatus("Joining…");
    try {
      await ensureCamera();
    } catch {
      pushToast("Need camera/microphone to join.", "error");
      return;
    }
    attachRoomSocket(inc.roomId);
  }

  function declineIncoming() {
    if (!incoming) {
      return;
    }
    ringStop();
    sendNotify({ kind: "invite-decline", callId: incoming.callId });
    setIncoming(null);
    pushToast("Call declined", "info");
  }

  function onBackgroundFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (bgObjectUrlRef.current) {
      URL.revokeObjectURL(bgObjectUrlRef.current);
      bgObjectUrlRef.current = null;
    }
    if (!f) {
      setBgImage(null);
      return;
    }
    const url = URL.createObjectURL(f);
    bgObjectUrlRef.current = url;
    const img = new Image();
    img.onload = () => {
      setBgImage(img);
      pushToast("Background image ready", "success");
    };
    img.onerror = () => {
      pushToast("Could not load that image", "error");
      URL.revokeObjectURL(url);
      bgObjectUrlRef.current = null;
    };
    img.src = url;
  }

  const peerTiles = Object.entries(remoteStreams);

  return (
    <section className="meeting-shell">
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>

      {incoming ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card ring-modal" role="dialog" aria-modal="true" aria-labelledby="ring-title">
            <div className="ring-avatar ring-pulse">{incoming.fromDisplayName.slice(0, 1).toUpperCase()}</div>
            <h3 id="ring-title">Incoming call</h3>
            <p className="ring-sub">
              <strong>{incoming.fromDisplayName}</strong>
              <br />
              <span className="mono subtle">{incoming.fromEmail}</span>
            </p>
            <p className="muted small">Room ID (you will join this room)</p>
            <p className="mono room-chip">{incoming.roomId}</p>
            <div className="modal-actions">
              <button type="button" className="btn-decline" onClick={declineIncoming}>
                Decline
              </button>
              <button type="button" className="btn-accept" onClick={() => void acceptIncoming()}>
                Accept &amp; join
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="meeting-card">
        <header className="meeting-header">
          <div>
            <h2 className="meeting-title">Video room</h2>
            <p className="muted meeting-sub">
              Mesh WebRTC · Go signaling · Optional ML blur &amp; background (updates live for other participants)
            </p>
          </div>
          {joined ? <span className="badge-live">Live</span> : null}
          {outboundCallId ? <span className="badge-ringing">Ringing…</span> : null}
        </header>

        {status ? <div className="status-pill">{status}</div> : null}
        {effectError ? <p className="error">{effectError}</p> : null}

        <div className="video-grid group-grid meeting-grid">
          <div className="video-tile meeting-peer-tile local-highlight">
            <span className="video-label">You</span>
            <video ref={localVideoRef} autoPlay playsInline muted className="video-fit" />
          </div>
          {peerTiles.map(([pid, stream]) => (
            <PeerTile
              key={pid}
              stream={stream}
              label={participants[pid]?.displayName ?? pid.slice(0, 8)}
            />
          ))}
        </div>

        <div className="meeting-controls">
          <div className="control-block">
            <span className="control-label">Camera &amp; background</span>
            <div className="row wrap control-row">
              <label className="effect-select">
                Effect
                <select
                  value={effectMode}
                  onChange={(e) => setEffectMode(e.target.value as VideoEffectMode)}
                >
                  <option value="none">None</option>
                  <option value="blur">Blur background</option>
                  <option value="background">Custom background</option>
                </select>
              </label>
              {effectMode === "background" ? (
                <label className="effect-file">
                  Image file
                  <input type="file" accept="image/*" onChange={onBackgroundFile} />
                </label>
              ) : null}
              {notificationsSupported() ? (
                <button
                  type="button"
                  className="secondary btn-compact"
                  onClick={() => void ensureNotificationPermission().then((ok) => pushToast(ok ? "Notifications on" : "Notifications blocked", ok ? "success" : "error"))}
                >
                  Enable notifications
                </button>
              ) : null}
            </div>
          </div>

          <div className="control-block">
            <span className="control-label">Room</span>
            <div className="inline-form meeting-room-row">
              <label className="grow">
                Room ID
                <input
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="shared UUID"
                  disabled={joined}
                />
              </label>
              <button type="button" className="secondary" onClick={createNewRoom} disabled={joined}>
                New ID
              </button>
            </div>
            <div className="row wrap">
              <button type="button" className="btn-primary" onClick={() => void joinRoom()} disabled={joined || !roomId.trim()}>
                Join room
              </button>
              <button type="button" className="secondary" onClick={leaveRoom} disabled={!joined && !rawLocal}>
                Leave
              </button>
            </div>
          </div>

          <div className="control-block">
            <span className="control-label">Invite &amp; ring</span>
            <form onSubmit={onLookupInvite} className="inline-form">
              <label className="grow">
                Email
                <input
                  type="email"
                  value={peerEmail}
                  onChange={(e) => setPeerEmail(e.target.value)}
                  placeholder="colleague@company.com"
                />
              </label>
              <button type="submit" className="secondary">
                Lookup
              </button>
            </form>
            <div className="row wrap" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="btn-ring" onClick={() => void onRingInvite()} disabled={!!outboundCallId}>
                Ring &amp; send invite
              </button>
            </div>
            {lookupMsg ? <p className="lookup-result subtle">{lookupMsg}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
