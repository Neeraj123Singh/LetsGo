import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

export type ActiveMeetingPayload = {
  roomId: string;
  mode: "audio" | "video";
  autoRingPeerId?: string;
  autoRingPeerEmail?: string;
  autoJoin?: boolean;
};

/** Restore `/call/:roomId` query when expanding from the minimized dock. */
export function meetingPathWithQuery(p: ActiveMeetingPayload): string {
  const q = new URLSearchParams();
  q.set("mode", p.mode);
  if (p.autoRingPeerId) q.set("peer", p.autoRingPeerId);
  if (p.autoRingPeerEmail) q.set("peerEmail", p.autoRingPeerEmail);
  if (p.autoJoin) q.set("auto", "1");
  const qs = q.toString();
  return `/call/${encodeURIComponent(p.roomId)}${qs ? `?${qs}` : ""}`;
}

type Ctx = {
  /** When set, a call session is tracked (MeetingRoom stays mounted while browsing). */
  session: ActiveMeetingPayload | null;
  /** True when route is NOT `/call/:id` but session still alive. */
  minimized: boolean;
  bindSession: (p: ActiveMeetingPayload) => void;
  /** Clear WS/media by unmount MeetingRoom via null session */
  clearSession: () => void;
};

const Ctx = createContext<Ctx | null>(null);

export function ActiveMeetingProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ActiveMeetingPayload | null>(null);
  const [minimized, setMinimized] = useState(false);
  const location = useLocation();

  const bindSession = useCallback((p: ActiveMeetingPayload) => {
    setSession(p);
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    setMinimized(false);
  }, []);

  // Route ↔ chrome: sidebar navigation away from `/call/...` only minimizes (does not end call).
  useEffect(() => {
    if (!session) return;
    const onCall = /^\/call\/[^/]+$/.test(location.pathname);
    setMinimized(!onCall);
  }, [location.pathname, session]);

  const value = useMemo(
    () => ({ session, minimized, bindSession, clearSession }),
    [session, minimized, bindSession, clearSession]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveMeeting(): Ctx {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useActiveMeeting must be used inside ActiveMeetingProvider");
  }
  return v;
}
