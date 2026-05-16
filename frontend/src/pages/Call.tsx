import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MeetingRoom } from "../call/MeetingRoom";

export function Call() {
  const { roomId = "" } = useParams();
  const [params] = useSearchParams();
  const mode = (params.get("mode") === "audio" ? "audio" : "video") as "audio" | "video";
  const autoRingPeerId = params.get("peer") ?? undefined;
  /** Pass-through from Contacts / Home — avoids flaky contacts-ID matching vs URL. */
  const autoRingPeerEmail = params.get("peerEmail") ?? undefined;
  const autoJoin = params.get("auto") === "1";
  const nav = useNavigate();

  if (!roomId || roomId.length < 8) {
    return (
      <div className="page-wrap">
        <div className="card">
          <h1>Invalid room</h1>
          <p className="muted">That room ID is too short.</p>
          <button type="button" onClick={() => nav("/")}>Back home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <MeetingRoom
        roomId={roomId}
        mode={mode}
        autoRingPeerId={autoRingPeerId}
        autoRingPeerEmail={autoRingPeerEmail}
        autoJoin={autoJoin}
        onLeave={() => nav("/")}
      />
    </div>
  );
}
