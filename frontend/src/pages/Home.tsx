import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMe, logout, type UserResponse } from "../api/auth";
import { getToken } from "../api/client";
import { GroupCallPanel } from "../components/GroupCallPanel";

export function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (!cancelled) {
          setUser(me);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load profile");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <p className="muted">Loading your home…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <h1>Session issue</h1>
          <p className="error">{error}</p>
          <button type="button" onClick={onLogout}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card wide">
        <header className="home-header">
          <div>
            <h1>Welcome, {user?.displayName}</h1>
            <p className="muted">You are signed in. Start a 1:1 video call when your contact is online below.</p>
          </div>
          <button type="button" className="secondary" onClick={onLogout}>
            Sign out
          </button>
        </header>
        <dl className="details">
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>User ID</dt>
            <dd className="mono">{user?.id}</dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{user?.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</dd>
          </div>
        </dl>

        {user ? <GroupCallPanel me={user} /> : null}
      </div>
    </div>
  );
}
