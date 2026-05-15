import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listContacts, type ContactView } from "../api/connections";
import { fetchRecents, type RecentEntry } from "../api/messages";

function avatarOf(s: string): string {
  return s.slice(0, 1).toUpperCase();
}

export function Chats() {
  const nav = useNavigate();
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listContacts().catch(() => []), fetchRecents().catch(() => [])]).then(([c, r]) => {
      if (cancelled) return;
      setContacts(c);
      setRecents(r);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="page-wrap"><p className="muted">Loading…</p></div>;
  }

  // Surface recents that are also confirmed contacts first, then the rest of the contacts.
  const contactsById = new Map(contacts.map((c) => [c.user.id, c]));
  const recentContactRows = recents.filter((r) => contactsById.has(r.userId));
  const otherContacts = contacts.filter((c) => !recents.some((r) => r.userId === c.user.id));

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <h1 className="page-title">Chats</h1>
          <p className="muted">All your 1:1 conversations.</p>
        </div>
      </header>

      {recentContactRows.length === 0 && otherContacts.length === 0 ? (
        <div className="empty">
          You don't have any contacts yet. Add some from <a onClick={() => nav("/contacts")} role="link">Contacts</a>.
        </div>
      ) : null}

      {recentContactRows.length > 0 ? (
        <section className="section">
          <div className="section-head"><h2>Recent</h2></div>
          <ul className="chat-list">
            {recentContactRows.map((r) => (
              <li key={r.userId} className="chat-row" onClick={() => nav(`/chats/${r.userId}`)}>
                <div className="avatar">{avatarOf(r.displayName || r.email)}</div>
                <div className="cc-text">
                  <div className="cc-name">{r.displayName}</div>
                  <div className="cc-email">{r.email}</div>
                </div>
                <span className="muted small">{new Date(r.lastAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {otherContacts.length > 0 ? (
        <section className="section">
          <div className="section-head"><h2>Contacts</h2></div>
          <ul className="chat-list">
            {otherContacts.map((c) => (
              <li key={c.user.id} className="chat-row" onClick={() => nav(`/chats/${c.user.id}`)}>
                <div className="avatar">{avatarOf(c.user.displayName || c.user.email)}</div>
                <div className="cc-text">
                  <div className="cc-name">{c.user.displayName}</div>
                  <div className="cc-email">{c.user.email}</div>
                </div>
                <span className="muted small">Tap to chat</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
