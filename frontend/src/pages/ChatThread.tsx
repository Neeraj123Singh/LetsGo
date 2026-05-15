import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useNotify } from "../notify/NotifyContext";
import { listContacts, type ContactView } from "../api/connections";
import {
  fetchDirectMessages,
  sendDirectMessage,
  type DirectMessage,
} from "../api/messages";

function avatarOf(s: string): string {
  return s.slice(0, 1).toUpperCase();
}

export function ChatThread() {
  const { peerId = "" } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { subscribeDM, pushToast } = useNotify();

  const [peer, setPeer] = useState<ContactView["user"] | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!peerId || !user) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listContacts().catch(() => [] as ContactView[]),
      fetchDirectMessages(peerId).catch(() => [] as DirectMessage[]),
    ]).then(([contacts, msgs]) => {
      if (cancelled) return;
      const p = contacts.find((c) => c.user.id === peerId);
      setPeer(p ? p.user : null);
      // store oldest → newest for rendering
      setMessages([...msgs].reverse());
      setLoading(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    });
    return () => {
      cancelled = true;
    };
  }, [peerId, user]);

  // Live updates: subscribe to chat-dm events for this conversation.
  useEffect(() => {
    if (!user || !peerId) return;
    return subscribeDM((m) => {
      const involvesPeer =
        (m.senderId === peerId && m.recipientId === user.id) ||
        (m.senderId === user.id && m.recipientId === peerId);
      if (!involvesPeer) return;
      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        return [...prev, m];
      });
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
    });
  }, [peerId, subscribeDM, user]);

  const onSend = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const body = draft.trim();
      if (!body || !peerId) return;
      setSending(true);
      try {
        const sent = await sendDirectMessage(peerId, body);
        setMessages((prev) => (prev.some((x) => x.id === sent.id) ? prev : [...prev, sent]));
        setDraft("");
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
      } catch (e) {
        pushToast(e instanceof Error ? e.message : "Send failed", "error");
      } finally {
        setSending(false);
      }
    },
    [draft, peerId, pushToast]
  );

  function startCall(mode: "audio" | "video") {
    if (!peerId) return;
    const roomId = crypto.randomUUID();
    nav(`/call/${encodeURIComponent(roomId)}?mode=${mode}&peer=${peerId}`);
  }

  const groups = useMemo(() => {
    const out: { date: string; messages: DirectMessage[] }[] = [];
    for (const m of messages) {
      const d = new Date(m.createdAt).toDateString();
      const last = out[out.length - 1];
      if (last && last.date === d) {
        last.messages.push(m);
      } else {
        out.push({ date: d, messages: [m] });
      }
    }
    return out;
  }, [messages]);

  return (
    <div className="page-wrap chat-page">
      <header className="chat-thread-head">
        <button type="button" className="btn-icon back" onClick={() => nav("/chats")} title="Back">‹</button>
        {peer ? (
          <>
            <div className="avatar">{avatarOf(peer.displayName || peer.email)}</div>
            <div className="cc-text">
              <div className="cc-name">{peer.displayName}</div>
              <div className="cc-email">{peer.email}</div>
            </div>
            <div className="cc-actions">
              <button type="button" className="btn-icon" title="Audio call" onClick={() => startCall("audio")}>☎</button>
              <button type="button" className="btn-icon" title="Video call" onClick={() => startCall("video")}>▶</button>
            </div>
          </>
        ) : (
          <div className="cc-text">
            <div className="cc-name">Unknown contact</div>
            <div className="cc-email muted">You're not connected with this user.</div>
          </div>
        )}
      </header>

      <div className="chat-scroll" ref={scrollRef}>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="muted center">No messages yet — say hi.</p>
        ) : (
          groups.map((g) => (
            <div key={g.date}>
              <div className="chat-date-divider"><span>{new Date(g.date).toLocaleDateString()}</span></div>
              {g.messages.map((m) => {
                const mine = m.senderId === user?.id;
                return (
                  <div key={m.id} className={`bubble-row ${mine ? "mine" : "theirs"}`}>
                    <div className="bubble">
                      <div className="bubble-body">{m.body}</div>
                      <div className="bubble-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <form className="chat-composer" onSubmit={onSend}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={peer ? `Message ${peer.displayName}…` : "Connect first to chat"}
          disabled={!peer || sending}
          maxLength={4000}
          autoFocus
        />
        <button type="submit" className="btn-primary" disabled={!peer || sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
