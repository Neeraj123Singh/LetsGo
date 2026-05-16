import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { useAuth } from "../auth/AuthContext";

export function Login() {
  const navigate = useNavigate();
  const { user, loading: authBusy, finalizeAuthSession } = useAuth();

  useEffect(() => {
    if (!authBusy && user) {
      navigate("/", { replace: true });
    }
  }, [authBusy, user, navigate]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const authResp = await login({ email, password });
      const ok = await finalizeAuthSession(authResp);
      if (ok) {
        navigate("/", { replace: true });
      } else {
        setError("Signed in but could not load your profile. Try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h1>Sign in</h1>
        <p className="muted">Use the account you registered with.</p>
        <form onSubmit={onSubmit} className="form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="footer-link">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
