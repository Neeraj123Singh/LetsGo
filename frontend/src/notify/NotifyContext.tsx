import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { meetingNotifyWebSocketUrl } from "../meeting/ws";
import type { DirectMessage } from "../api/messages";

export type IncomingCall = {
  callId: string;
  roomId: string;
  mode: "audio" | "video";
  fromUserId: string;
  fromEmail: string;
  fromDisplayName: string;
};

type Toast = { id: number; tone: "info" | "success" | "error"; message: string };

type DmListener = (msg: DirectMessage) => void;

type NotifyState = {
  ready: boolean;
  /** Push a payload to the notify WS (no-op if not open). */
  send: (payload: unknown) => void;
  /** Subscribe to incoming direct messages (returns unsubscribe). */
  subscribeDM: (fn: DmListener) => () => void;
  pushToast: (message: string, tone?: Toast["tone"]) => void;
  toasts: Toast[];
  /** Currently-displayed incoming-call modal payload (null if none). */
  incoming: IncomingCall | null;
  acceptIncoming: () => void;
  declineIncoming: () => void;
  outboundCallId: string | null;
  setOutboundCallId: (id: string | null) => void;
};

const Ctx = createContext<NotifyState | null>(null);

export function NotifyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const wsRef = useRef<WebSocket | null>(null);
  const [ready, setReady] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const pushToast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [outboundCallId, setOutboundCallId] = useState<string | null>(null);

  const dmListenersRef = useRef<Set<DmListener>>(new Set());
  const subscribeDM = useCallback((fn: DmListener) => {
    dmListenersRef.current.add(fn);
    return () => {
      dmListenersRef.current.delete(fn);
    };
  }, []);

  const send = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    if (!user) {
      wsRef.current?.close();
      wsRef.current = null;
      setReady(false);
      return;
    }

    let cancelled = false;
    let retry = 0;

    function connect() {
      if (cancelled) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(meetingNotifyWebSocketUrl());
      } catch {
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setReady(true);
        retry = 0;
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        } catch {
          return;
        }
        const kind = msg.kind as string;
        if (kind === "incoming-call") {
          const m = (msg.mode as string) === "audio" ? "audio" : "video";
          setIncoming({
            callId: String(msg.callId),
            roomId: String(msg.roomId),
            mode: m as "audio" | "video",
            fromUserId: String(msg.fromUserId),
            fromEmail: String(msg.fromEmail),
            fromDisplayName: String(msg.fromDisplayName),
          });
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
          pushToast("Invitee accepted — they are joining", "success");
          return;
        }
        if (kind === "chat-dm") {
          const dm: DirectMessage = {
            id: String(msg.id),
            senderId: String(msg.senderId),
            recipientId: String(msg.recipientId),
            body: String(msg.body),
            createdAt: String(msg.createdAt),
          };
          dmListenersRef.current.forEach((fn) => fn(dm));
          if (user && dm.senderId !== user.id) {
            pushToast(`New message`, "info");
          }
          return;
        }
      };

      ws.onclose = () => {
        setReady(false);
        if (cancelled) return;
        retry += 1;
        const delay = Math.min(15_000, 500 * 2 ** retry);
        window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // surfaced via onclose retry
      };
    }

    connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user, pushToast]);

  const acceptIncoming = useCallback(() => {
    if (!incoming) return;
    const inc = incoming;
    setIncoming(null);
    send({ kind: "invite-accepted", callId: inc.callId });
    navigate(`/call/${encodeURIComponent(inc.roomId)}?mode=${inc.mode}&auto=1`);
  }, [incoming, navigate, send]);

  const declineIncoming = useCallback(() => {
    if (!incoming) return;
    send({ kind: "invite-decline", callId: incoming.callId });
    setIncoming(null);
    pushToast("Call declined", "info");
  }, [incoming, pushToast, send]);

  const value = useMemo<NotifyState>(
    () => ({
      ready,
      send,
      subscribeDM,
      pushToast,
      toasts,
      incoming,
      acceptIncoming,
      declineIncoming,
      outboundCallId,
      setOutboundCallId,
    }),
    [ready, send, subscribeDM, pushToast, toasts, incoming, acceptIncoming, declineIncoming, outboundCallId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotify(): NotifyState {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useNotify must be used inside NotifyProvider");
  }
  return v;
}
