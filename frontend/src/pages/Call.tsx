import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useActiveMeeting } from "../meeting/ActiveMeetingContext";

export function Call() {
  const { roomId = "" } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { bindSession } = useActiveMeeting();

  const mode = (params.get("mode") === "audio" ? "audio" : "video") as "audio" | "video";
  const autoRingPeerId = params.get("peer") ?? undefined;
  const autoRingPeerEmail = params.get("peerEmail") ?? undefined;
  const autoJoin = params.get("auto") === "1";

  const valid = Boolean(roomId && roomId.length >= 8);

  useEffect(() => {
    if (!valid) return;
    bindSession({
      roomId,
      mode,
      autoRingPeerId,
      autoRingPeerEmail,
      autoJoin,
    });
  }, [
    valid,
    roomId,
    mode,
    autoRingPeerId,
    autoRingPeerEmail,
    autoJoin,
    bindSession,
  ]);

  if (!valid) {
    return (
      <div className="page-wrap">
        <div className="card">
          <h1>Invalid room</h1>
          <p className="muted">That room ID is too short.</p>
          <button type="button" onClick={() => nav("/")}>
            Back home
          </button>
        </div>
      </div>
    );
  }

  // Meeting UI is rendered from AppShell while `bindSession` is active.
  return null;
}
