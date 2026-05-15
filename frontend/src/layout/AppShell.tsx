import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useNotify } from "../notify/NotifyContext";

const NAV = [
  { to: "/", label: "Home", end: true, icon: "◎" },
  { to: "/contacts", label: "Contacts", icon: "☻" },
  { to: "/chats", label: "Chats", icon: "✎" },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const { toasts, incoming, acceptIncoming, declineIncoming } = useNotify();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Primary navigation">
        <div className="brand" onClick={() => navigate("/")} role="button" tabIndex={0}>
          <span className="brand-logo">l</span>
          <span className="brand-name">letsgo</span>
        </div>
        <nav className="nav-list">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <span className="nav-icon" aria-hidden>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="me-card">
            <div className="avatar" aria-hidden>{(user.displayName || user.email).slice(0, 1).toUpperCase()}</div>
            <div className="me-text">
              <div className="me-name">{user.displayName}</div>
              <div className="me-email" title={user.email}>{user.email}</div>
            </div>
          </div>
          <button type="button" className="secondary btn-compact" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>
        ))}
      </div>

      {incoming ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card ring-modal" role="dialog" aria-modal="true" aria-labelledby="ring-title">
            <div className="ring-avatar ring-pulse">{incoming.fromDisplayName.slice(0, 1).toUpperCase()}</div>
            <h3 id="ring-title">Incoming {incoming.mode} call</h3>
            <p className="ring-sub">
              <strong>{incoming.fromDisplayName}</strong>
              <br />
              <span className="mono subtle">{incoming.fromEmail}</span>
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-decline" onClick={declineIncoming}>Decline</button>
              <button type="button" className="btn-accept" onClick={acceptIncoming}>Accept &amp; join</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
