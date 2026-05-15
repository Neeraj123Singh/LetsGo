import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listContacts,
  listRequests,
  removeContact,
  respondToRequest,
  searchUsersByEmail,
  sendConnectionRequest,
  type ConnectionRequestView,
  type ContactView,
  type UserSummary,
} from "../api/connections";
import { useNotify } from "../notify/NotifyContext";

function avatarOf(s: string): string {
  return s.slice(0, 1).toUpperCase();
}

type Tab = "search" | "requests" | "contacts";

export function Contacts() {
  const nav = useNavigate();
  const { pushToast } = useNotify();
  const [tab, setTab] = useState<Tab>("contacts");

  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [incoming, setIncoming] = useState<ConnectionRequestView[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequestView[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [c, inc, out] = await Promise.all([
      listContacts().catch(() => []),
      listRequests("incoming").catch(() => []),
      listRequests("outgoing").catch(() => []),
    ]);
    setContacts(c);
    setIncoming(inc);
    setOutgoing(out);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startCall(peerId: string, mode: "video" | "audio") {
    const roomId = crypto.randomUUID();
    nav(`/call/${encodeURIComponent(roomId)}?mode=${mode}&peer=${peerId}`);
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="muted">Find people, manage requests, message and call your network.</p>
        </div>
      </header>

      <div className="tab-bar" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "contacts"}
          className={`tab ${tab === "contacts" ? "active" : ""}`}
          onClick={() => setTab("contacts")}
        >
          My contacts <span className="muted small">({contacts.length})</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "requests"}
          className={`tab ${tab === "requests" ? "active" : ""}`}
          onClick={() => setTab("requests")}
        >
          Requests <span className="muted small">({incoming.length + outgoing.length})</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "search"}
          className={`tab ${tab === "search" ? "active" : ""}`}
          onClick={() => setTab("search")}
        >
          Find people
        </button>
      </div>

      {tab === "contacts" ? (
        <ContactList
          loading={loading}
          contacts={contacts}
          onRemove={async (id) => {
            try {
              await removeContact(id);
              pushToast("Contact removed", "success");
              await reload();
            } catch (e) {
              pushToast(e instanceof Error ? e.message : "Remove failed", "error");
            }
          }}
          onCall={(id, m) => startCall(id, m)}
          onChat={(id) => nav(`/chats/${id}`)}
        />
      ) : null}

      {tab === "requests" ? (
        <RequestsView
          incoming={incoming}
          outgoing={outgoing}
          onAct={async (id, action) => {
            try {
              await respondToRequest(id, action);
              pushToast(action === "accept" ? "Request accepted" : action === "decline" ? "Request declined" : "Request cancelled", "success");
              await reload();
            } catch (e) {
              pushToast(e instanceof Error ? e.message : "Action failed", "error");
            }
          }}
        />
      ) : null}

      {tab === "search" ? (
        <SearchView
          contactIds={new Set(contacts.map((c) => c.user.id))}
          outgoingEmails={new Set(outgoing.map((o) => o.addressee.email.toLowerCase()))}
          onRequest={async (email) => {
            try {
              await sendConnectionRequest(email);
              pushToast(`Request sent to ${email}`, "success");
              await reload();
            } catch (e) {
              pushToast(e instanceof Error ? e.message : "Send failed", "error");
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ContactList({
  loading,
  contacts,
  onRemove,
  onCall,
  onChat,
}: {
  loading: boolean;
  contacts: ContactView[];
  onRemove: (id: string) => Promise<void>;
  onCall: (id: string, mode: "audio" | "video") => void;
  onChat: (id: string) => void;
}) {
  if (loading) return <p className="muted">Loading…</p>;
  if (contacts.length === 0) {
    return (
      <div className="empty">
        No contacts yet — switch to <strong>Find people</strong> to send a connection request.
      </div>
    );
  }
  return (
    <ul className="contact-list">
      {contacts.map((c) => (
        <li key={c.user.id} className="contact-row">
          <div className="avatar">{avatarOf(c.user.displayName || c.user.email)}</div>
          <div className="cc-text">
            <div className="cc-name">{c.user.displayName}</div>
            <div className="cc-email">{c.user.email}</div>
          </div>
          <div className="cc-actions">
            <button type="button" className="btn-icon" title="Chat" onClick={() => onChat(c.user.id)}>✎</button>
            <button type="button" className="btn-icon" title="Audio call" onClick={() => onCall(c.user.id, "audio")}>☎</button>
            <button type="button" className="btn-icon" title="Video call" onClick={() => onCall(c.user.id, "video")}>▶</button>
            <button type="button" className="btn-icon danger" title="Remove" onClick={() => void onRemove(c.user.id)}>✕</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RequestsView({
  incoming,
  outgoing,
  onAct,
}: {
  incoming: ConnectionRequestView[];
  outgoing: ConnectionRequestView[];
  onAct: (id: string, action: "accept" | "decline" | "cancel") => Promise<void>;
}) {
  return (
    <div className="requests-grid">
      <section>
        <h3 className="section-sub">Incoming</h3>
        {incoming.length === 0 ? (
          <p className="muted small">No incoming requests.</p>
        ) : (
          <ul className="contact-list">
            {incoming.map((r) => (
              <li key={r.id} className="contact-row">
                <div className="avatar">{avatarOf(r.requester.displayName || r.requester.email)}</div>
                <div className="cc-text">
                  <div className="cc-name">{r.requester.displayName}</div>
                  <div className="cc-email">{r.requester.email}</div>
                </div>
                <div className="cc-actions">
                  <button type="button" className="btn-accept btn-compact" onClick={() => void onAct(r.id, "accept")}>Accept</button>
                  <button type="button" className="btn-decline btn-compact" onClick={() => void onAct(r.id, "decline")}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="section-sub">Outgoing</h3>
        {outgoing.length === 0 ? (
          <p className="muted small">No pending requests sent.</p>
        ) : (
          <ul className="contact-list">
            {outgoing.map((r) => (
              <li key={r.id} className="contact-row">
                <div className="avatar">{avatarOf(r.addressee.displayName || r.addressee.email)}</div>
                <div className="cc-text">
                  <div className="cc-name">{r.addressee.displayName}</div>
                  <div className="cc-email">{r.addressee.email}</div>
                </div>
                <div className="cc-actions">
                  <span className="badge">Pending</span>
                  <button type="button" className="btn-icon danger" title="Cancel" onClick={() => void onAct(r.id, "cancel")}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SearchView({
  contactIds,
  outgoingEmails,
  onRequest,
}: {
  contactIds: Set<string>;
  outgoingEmails: Set<string>;
  onRequest: (email: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await searchUsersByEmail(q);
      setResults(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="inline-form" onSubmit={onSubmit}>
        <label className="grow">
          Search by email
          <input
            type="text"
            placeholder="type at least 3 characters of an email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy || q.trim().length < 3}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {results.length === 0 && !busy ? (
        <p className="muted small">No matches yet — search for someone you know.</p>
      ) : (
        <ul className="contact-list">
          {results.map((u) => {
            const already = contactIds.has(u.id);
            const requested = outgoingEmails.has(u.email.toLowerCase());
            return (
              <li key={u.id} className="contact-row">
                <div className="avatar">{avatarOf(u.displayName || u.email)}</div>
                <div className="cc-text">
                  <div className="cc-name">{u.displayName}</div>
                  <div className="cc-email">{u.email}</div>
                </div>
                <div className="cc-actions">
                  {already ? (
                    <span className="badge success">Already connected</span>
                  ) : requested ? (
                    <span className="badge">Request sent</span>
                  ) : (
                    <button type="button" className="btn-primary btn-compact" onClick={() => void onRequest(u.email)}>
                      Connect
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
