import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { useNotify } from "../notify/NotifyContext";
import type { UserResponse } from "../api/auth";
import { meetingRoomWebSocketUrl } from "../meeting/ws";
import { DEFAULT_ICE_SERVERS } from "../webrtc/iceServers";
import { useLocalVideoEffects, type VideoEffectMode } from "../video/useLocalVideoEffects";
import { fetchRoomMessages, touchRecent, type RoomMessage } from "../api/messages";
import { lookupUserByEmail } from "../api/users";
import { listContacts } from "../api/connections";

type PeerInfo = { userId: string; email: string; displayName: string };

type Props = {
  roomId: string;
  mode: "audio" | "video";
  /** Optional: pre-known peer to auto-ring with an invite after joining. */
  autoRingPeerId?: string;
  /** When true (accepted incoming call), join without ringing anyone. */
  autoJoin?: boolean;
  onLeave?: () => void;
};

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
  const hasVideo = stream.getVideoTracks().length > 0;
  return (
    <div className="video-tile meeting-peer-tile">
      <span className="video-label">{label}</span>
      {hasVideo ? (
        <video ref={ref} autoPlay playsInline className="video-fit" />
      ) : (
        <div className="audio-only-tile">
          <div className="ring-avatar">{label.slice(0, 1).toUpperCase()}</div>
          <div className="muted small" style={{ marginTop: "0.5rem" }}>{label}</div>
          <audio ref={ref as unknown as React.RefObject<HTMLAudioElement>} autoPlay />
        </div>
      )}
    </div>
  );
}

export function MeetingRoom({ roomId, mode, autoRingPeerId, autoJoin, onLeave }: Props) {
  const { user } = useAuth() as { user: UserResponse };
  const { send: sendNotify, setOutboundCallId } = useNotify();

  const isVideoCall = mode === "video";
  const [rawLocal, setRawLocal] = useState<MediaStream | null>(null);
  const rawLocalRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    rawLocalRef.current = rawLocal;
  }, [rawLocal]);

  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState<string>("Preparing…");
  const [participants, setParticipants] = useState<Record<string, PeerInfo>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  const [effectMode, setEffectMode] = useState<VideoEffectMode>("none");
  const [bgImage] = useState<HTMLImageElement | null>(null);
  const { displayStream, effectError } = useLocalVideoEffects(rawLocal, effectMode, bgImage);
  const displayStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    displayStreamRef.current = displayStream;
  }, [displayStream]);

  // Screen sharing
  const [screenShareStream, setScreenShareStream] = useState<MediaStream | null>(null);
  const screenShareRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    screenShareRef.current = screenShareStream;
  }, [screenShareStream]);

  // Track which stream each peer connection is currently sending video from
  // ("camera" or "screen"). Used so toggling screen share updates the senders.
  const localVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!localVideoRef.current) return;
    const next = screenShareStream ?? displayStream ?? rawLocal ?? null;
    localVideoRef.current.srcObject = next;
  }, [screenShareStream, displayStream, rawLocal]);

  // Audio/video toggles
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(isVideoCall);
  useEffect(() => {
    rawLocal?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [rawLocal, micOn]);
  useEffect(() => {
    rawLocal?.getVideoTracks().forEach((t) => (t.enabled = camOn));
  }, [rawLocal, camOn]);

  // Recording (MediaRecorder of the local mix: chosen video stream + mic)
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // In-meeting chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<RoomMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Toggleable: which local video track to send to peers.
  const activeVideoStream = useCallback((): MediaStream | null => {
    if (screenShareRef.current) return screenShareRef.current;
    return displayStreamRef.current ?? rawLocalRef.current ?? null;
  }, []);

  const sendRoom = useCallback((payload: unknown) => {
    const ws = wsRef.current;
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
      if (pc) return pc;
      const videoStream = activeVideoStream();
      const audioStream = rawLocalRef.current;
      // For audio-only calls, an audio stream is enough.
      if (!videoStream && !audioStream) {
        return null;
      }
      pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });
      pcsRef.current.set(peerId, pc);
      const groupStream = videoStream ?? audioStream!;
      if (videoStream) {
        videoStream.getVideoTracks().forEach((t) => pc!.addTrack(t, groupStream));
      }
      if (audioStream) {
        audioStream.getAudioTracks().forEach((t) => pc!.addTrack(t, groupStream));
      }
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
    [activeVideoStream, sendRoom]
  );

  const createOfferToPeer = useCallback(
    async (peer: PeerInfo) => {
      if (!user) return;
      if (!shouldInitiate(user.id, peer.userId)) return;
      const pc = getOrCreatePc(peer.userId);
      if (!pc || pc.localDescription?.type === "offer") return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendRoom({ kind: "webrtc-offer", targetUserId: peer.userId, sdp: offer.sdp });
    },
    [getOrCreatePc, sendRoom, user]
  );

  const handleRemoteOffer = useCallback(
    async (fromUserId: string, sdp: string) => {
      if (!user) return;
      if (shouldInitiate(user.id, fromUserId)) return;
      const pc = getOrCreatePc(fromUserId);
      if (!pc) return;
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendRoom({ kind: "webrtc-answer", targetUserId: fromUserId, sdp: answer.sdp });
      await flushIce(fromUserId, pc);
    },
    [flushIce, getOrCreatePc, sendRoom, user]
  );

  const handleRemoteAnswer = useCallback(
    async (fromUserId: string, sdp: string) => {
      if (!user) return;
      if (!shouldInitiate(user.id, fromUserId)) return;
      const pc = pcsRef.current.get(fromUserId);
      if (!pc) return;
      await pc.setRemoteDescription({ type: "answer", sdp });
      await flushIce(fromUserId, pc);
    },
    [flushIce, user]
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

  // Acquire local media once, then attach the room socket.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setStatus(isVideoCall ? "Starting camera & mic…" : "Starting microphone…");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isVideoCall ? { width: 1280, height: 720 } : false,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        rawLocalRef.current = stream;
        setRawLocal(stream);
      } catch {
        setStatus("Permission denied for camera/microphone.");
        return;
      }
      if (cancelled) return;
      attachRoomSocket();
    }
    void init();

    function attachRoomSocket() {
      const ws = new WebSocket(meetingRoomWebSocketUrl(roomId));
      wsRef.current = ws;
      ws.onopen = () => {
        setJoined(true);
        setStatus("Connected — linking peers…");
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
          for (const p of list) map[p.userId] = p;
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
          return;
        }
        if (kind === "peer-left") {
          const uid = msg.userId as string;
          pcsRef.current.get(uid)?.close();
          pcsRef.current.delete(uid);
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
          return;
        }
        if (kind === "chat-room") {
          const rm: RoomMessage = {
            id: String(msg.id),
            roomId: String(msg.roomId),
            senderId: String(msg.senderId),
            body: String(msg.body),
            createdAt: String(msg.createdAt),
          };
          setChatMessages((prev) => (prev.some((m) => m.id === rm.id) ? prev : [...prev, rm]));
          requestAnimationFrame(() =>
            chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" })
          );
          return;
        }
        const from = msg.fromUserId as string;
        if (kind === "webrtc-offer") return handleRemoteOffer(from, msg.sdp as string);
        if (kind === "webrtc-answer") return handleRemoteAnswer(from, msg.sdp as string);
        if (kind === "webrtc-ice") return handleRemoteIce(from, msg);
      };
      ws.onclose = () => {
        wsRef.current = null;
        setJoined(false);
        setStatus("Left room");
      };
    }

    return () => {
      cancelled = true;
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      screenShareRef.current?.getTracks().forEach((t) => t.stop());
      wsRef.current?.close();
      wsRef.current = null;
      closeAllPeers();
      rawLocalRef.current?.getTracks().forEach((t) => t.stop());
      rawLocalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isVideoCall]);

  // When the active video stream changes (effect toggled or screen share started), sync senders.
  useEffect(() => {
    if (!joined) return;
    const v = activeVideoStream()?.getVideoTracks()[0];
    const a = rawLocalRef.current?.getAudioTracks()[0];
    pcsRef.current.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track?.kind === "video") {
          if (v && sender.track.id !== v.id) {
            void sender.replaceTrack(v);
          } else if (!v && sender.track) {
            // audio-only or video turned off → null out
            void sender.replaceTrack(null);
          }
        }
        if (sender.track?.kind === "audio" && a && sender.track.id !== a.id) {
          void sender.replaceTrack(a);
        }
      });
    });
  }, [activeVideoStream, displayStream, screenShareStream, joined]);

  // Once joined and rosters known, create offers to peers with higher IDs.
  useEffect(() => {
    if (!joined) return;
    const peers = Object.values(participants).filter((p) => p.userId !== user.id);
    peers.forEach((p) => void createOfferToPeer(p));
  }, [joined, participants, createOfferToPeer, user.id]);

  // Auto-ring the intended peer once we're in the room.
  useEffect(() => {
    if (!joined || !autoRingPeerId || autoJoin) return;
    let cancelled = false;
    (async () => {
      try {
        // We have peer's userId only; fetch their email via lookup.
        // Easiest path: hit /v1/users/lookup with email — but we have id, not email.
        // Workaround: ring via the listContacts emails. Skip for now — caller
        // can also pass `peer` via URL but the simpler flow is to invite by email.
        // We rely on the global notify socket; just track the outbound call ID.
        const callId = crypto.randomUUID();
        setOutboundCallId(callId);
        // We need the peer email to send invite; pull it via the auth /api/connections list cached on Home.
        // Simpler: call recent/touch so the peer shows up; the actual ring happens from the contact row.
        await touchRecent(autoRingPeerId, "call").catch(() => undefined);
        if (cancelled) return;
        const contacts = await listContacts().catch(() => []);
        const peer = contacts.find((c) => c.user.id === autoRingPeerId);
        if (!peer) {
          setOutboundCallId(null);
          return;
        }
        await ringPeer(peer.user.email, callId);
      } catch {
        setOutboundCallId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, autoRingPeerId, autoJoin]);

  const ringPeer = useCallback(
    async (email: string, callId?: string) => {
      const id = callId ?? crypto.randomUUID();
      setOutboundCallId(id);
      try {
        await lookupUserByEmail(email).catch(() => undefined);
        sendNotify({
          kind: "invite",
          targetEmail: email,
          roomId,
          callId: id,
          mode,
        });
      } catch {
        setOutboundCallId(null);
      }
    },
    [mode, roomId, sendNotify, setOutboundCallId]
  );

  // Load existing in-meeting chat history when the panel opens.
  useEffect(() => {
    if (!chatOpen) return;
    fetchRoomMessages(roomId)
      .then((rows) => {
        setChatMessages((prev) => {
          if (prev.length > 0) return prev;
          return [...rows].reverse();
        });
      })
      .catch(() => undefined);
  }, [chatOpen, roomId]);

  async function toggleScreenShare() {
    if (screenShareStream) {
      screenShareStream.getTracks().forEach((t) => t.stop());
      setScreenShareStream(null);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
      // When the user stops sharing via the browser chrome, end it cleanly.
      s.getVideoTracks()[0].addEventListener("ended", () => {
        setScreenShareStream((prev) => (prev === s ? null : prev));
      });
      setScreenShareStream(s);
    } catch {
      // user cancelled — no-op
    }
  }

  function toggleRecording() {
    if (recording) {
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      return;
    }
    const videoSrc = activeVideoStream();
    const audioSrc = rawLocalRef.current;
    if (!videoSrc && !audioSrc) return;
    // Combine first video track + first audio track into a fresh stream.
    const combined = new MediaStream();
    videoSrc?.getVideoTracks().slice(0, 1).forEach((t) => combined.addTrack(t));
    audioSrc?.getAudioTracks().slice(0, 1).forEach((t) => combined.addTrack(t));
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mime });
      recordedChunksRef.current = [];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `letsgo-${roomId.slice(0, 8)}-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setRecording(false);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
  }

  function sendChat(e: FormEvent) {
    e.preventDefault();
    const body = chatDraft.trim();
    if (!body) return;
    sendRoom({ kind: "chat-room", body });
    setChatDraft("");
  }

  function leave() {
    wsRef.current?.close();
    onLeave?.();
  }

  const peerTiles = Object.entries(remoteStreams);

  const sortedChat = useMemo(() => [...chatMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [chatMessages]);

  return (
    <section className={`meeting-shell call-page-shell ${chatOpen ? "with-chat" : ""}`}>
      <div className="meeting-card call-card">
        <header className="meeting-header">
          <div>
            <h2 className="meeting-title">{isVideoCall ? "Video" : "Audio"} call</h2>
            <p className="muted meeting-sub">Room ID: <span className="mono">{roomId.slice(0, 8)}…</span></p>
          </div>
          <div className="row">
            {joined ? <span className="badge-live">Live</span> : null}
            {recording ? <span className="badge danger pulse">REC</span> : null}
            {screenShareStream ? <span className="badge">Sharing screen</span> : null}
          </div>
        </header>

        {status && !joined ? <div className="status-pill">{status}</div> : null}
        {effectError ? <div className="error">{effectError}</div> : null}

        <div className="video-grid group-grid meeting-grid">
          <div className="video-tile meeting-peer-tile local-highlight">
            <span className="video-label">You {!camOn && isVideoCall ? "· camera off" : ""}</span>
            {isVideoCall && camOn ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="video-fit" />
            ) : (
              <div className="audio-only-tile">
                <div className="ring-avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
                <div className="muted small">{user.displayName}</div>
              </div>
            )}
          </div>
          {peerTiles.map(([pid, stream]) => (
            <PeerTile
              key={pid}
              stream={stream}
              label={participants[pid]?.displayName ?? pid.slice(0, 8)}
            />
          ))}
        </div>

        <div className="call-controls">
          <button
            type="button"
            className={`ctl-btn ${micOn ? "" : "off"}`}
            onClick={() => setMicOn((v) => !v)}
            title={micOn ? "Mute mic" : "Unmute mic"}
          >
            {micOn ? "🎙" : "🔇"}
          </button>
          {isVideoCall ? (
            <button
              type="button"
              className={`ctl-btn ${camOn ? "" : "off"}`}
              onClick={() => setCamOn((v) => !v)}
              title={camOn ? "Stop camera" : "Start camera"}
            >
              {camOn ? "📷" : "🚫"}
            </button>
          ) : null}
          {isVideoCall ? (
            <button
              type="button"
              className={`ctl-btn ${screenShareStream ? "active" : ""}`}
              onClick={() => void toggleScreenShare()}
              title={screenShareStream ? "Stop sharing" : "Share screen"}
            >
              🖥
            </button>
          ) : null}
          <button
            type="button"
            className={`ctl-btn ${recording ? "active" : ""}`}
            onClick={toggleRecording}
            title={recording ? "Stop recording" : "Record meeting"}
          >
            {recording ? "⏹" : "⏺"}
          </button>
          <button
            type="button"
            className={`ctl-btn ${chatOpen ? "active" : ""}`}
            onClick={() => setChatOpen((v) => !v)}
            title="Toggle in-meeting chat"
          >
            💬
          </button>
          {isVideoCall ? (
            <select
              className="effect-inline"
              value={effectMode}
              onChange={(e) => setEffectMode(e.target.value as VideoEffectMode)}
            >
              <option value="none">No effect</option>
              <option value="blur">Blur</option>
            </select>
          ) : null}
          <button type="button" className="btn-leave" onClick={leave}>Leave</button>
        </div>

        <p className="muted small" style={{ marginTop: "1rem" }}>
          Share this room URL with anyone you want to bring in:{" "}
          <span className="mono">{`${window.location.origin}/call/${roomId}?mode=${mode}`}</span>
        </p>
      </div>

      {chatOpen ? (
        <aside className="in-meeting-chat">
          <header className="imc-head">
            <h3>Meeting chat</h3>
            <button type="button" className="btn-icon" onClick={() => setChatOpen(false)} title="Close">✕</button>
          </header>
          <div className="imc-scroll" ref={chatScrollRef}>
            {sortedChat.length === 0 ? (
              <p className="muted small center">No messages yet.</p>
            ) : (
              sortedChat.map((m) => {
                const mine = m.senderId === user.id;
                const p = participants[m.senderId];
                return (
                  <div key={m.id} className={`bubble-row ${mine ? "mine" : "theirs"}`}>
                    <div className="bubble">
                      {!mine ? <div className="bubble-author">{p?.displayName ?? "Guest"}</div> : null}
                      <div className="bubble-body">{m.body}</div>
                      <div className="bubble-time">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <form className="imc-composer" onSubmit={sendChat}>
            <input
              type="text"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder="Type a message…"
              maxLength={4000}
            />
            <button type="submit" className="btn-primary" disabled={!chatDraft.trim()}>Send</button>
          </form>
        </aside>
      ) : null}
    </section>
  );
}
