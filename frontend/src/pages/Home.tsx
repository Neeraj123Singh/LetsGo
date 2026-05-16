import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { listContacts, type ContactView } from "../api/connections";
import { fetchRecents, type RecentEntry } from "../api/messages";

function avatarOf(s: string): string {
  return s.slice(0, 1).toUpperCase();
}

function formatWhen(iso: string): string {
  const t = new Date(iso).getTime();
  const diffM = (Date.now() - t) / 60000;
  if (diffM < 1) return "just now";
  if (diffM < 60) return `${Math.floor(diffM)} min ago`;
  const diffH = diffM / 60;
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchRecents().catch(() => []), listContacts().catch(() => [])]).then(([r, c]) => {
      if (cancelled) return;
      setRecents(r);
      setContacts(c);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const carousel = useMemo(() => {
    const safeRecents = Array.isArray(recents) ? recents : [];
    if (safeRecents.length > 0) return safeRecents;
    const safeContacts = Array.isArray(contacts) ? contacts : [];
    return safeContacts.map<RecentEntry>((c) => ({
      userId: c.user.id,
      email: c.user.email,
      displayName: c.user.displayName,
      lastKind: "chat",
      lastAt: c.connectedAt,
    }));
  }, [recents, contacts]);

  function buildCallUrl(roomId: string, peerId: string, peerEmail: string | undefined, mode: "video" | "audio") {
    let q = `mode=${encodeURIComponent(mode)}&peer=${encodeURIComponent(peerId)}`;
    if (peerEmail?.trim()) {
      q += `&peerEmail=${encodeURIComponent(peerEmail.trim().toLowerCase())}`;
    }
    return `/call/${encodeURIComponent(roomId)}?${q}`;
  }

  function startCall(peerId: string, mode: "video" | "audio", peerEmail?: string) {
    const roomId = crypto.randomUUID();
    nav(buildCallUrl(roomId, peerId, peerEmail, mode));
  }

  function openChat(peerId: string) {
    nav(`/chats/${encodeURIComponent(peerId)}`);
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {user?.displayName}</h1>
          <p className="muted">Pick up where you left off, or start something new.</p>
        </div>
        <div className="row">
          <button type="button" className="btn-primary" onClick={() => nav("/contacts")}>
            Find people
          </button>
          <button type="button" className="secondary" onClick={() => {
            const id = crypto.randomUUID();
            nav(`/call/${encodeURIComponent(id)}?mode=video`);
          }}>
            New room
          </button>
        </div>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>Recent</h2>
          <span className="muted small">Tap to message or call</span>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : carousel.length === 0 ? (
          <div className="empty">
            No conversations yet. Head to <a onClick={() => nav("/contacts")} role="link">Contacts</a> to find people.
          </div>
        ) : (
          <div className="carousel" role="list">
            {carousel.map((r) => (
              <article key={r.userId} className="carousel-card" role="listitem">
                <div className="avatar lg">{avatarOf(r.displayName || r.email)}</div>
                <div className="cc-text">
                  <div className="cc-name" title={r.displayName}>{r.displayName}</div>
                  <div className="cc-email" title={r.email}>{r.email}</div>
                  <div className="cc-meta">
                    <span className="badge">{r.lastKind === "call" ? "Called" : "Chatted"}</span>
                    <span className="muted small">{formatWhen(r.lastAt)}</span>
                  </div>
                </div>
                <div className="cc-actions">
                  <button type="button" className="btn-icon" title="Chat" onClick={() => openChat(r.userId)}>✎</button>
                  <button type="button" className="btn-icon" title="Audio call" onClick={() => startCall(r.userId, "audio", r.email)}>☎</button>
                  <button type="button" className="btn-icon" title="Video call" onClick={() => startCall(r.userId, "video", r.email)}>▶</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Your contacts</h2>
          <span className="muted small">{contacts.length} connected</span>
        </div>
        {contacts.length === 0 ? (
          <div className="empty">No contacts yet.</div>
        ) : (
          <div className="contact-grid">
            {contacts.slice(0, 12).map((c) => (
              <article key={c.user.id} className="contact-card">
                <div className="avatar">{avatarOf(c.user.displayName || c.user.email)}</div>
                <div className="cc-text">
                  <div className="cc-name">{c.user.displayName}</div>
                  <div className="cc-email">{c.user.email}</div>
                </div>
                <div className="cc-actions">
                  <button type="button" className="btn-icon" title="Chat" onClick={() => openChat(c.user.id)}>✎</button>
                  <button type="button" className="btn-icon" title="Audio" onClick={() => startCall(c.user.id, "audio", c.user.email)}>☎</button>
                  <button type="button" className="btn-icon" title="Video" onClick={() => startCall(c.user.id, "video", c.user.email)}>▶</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
