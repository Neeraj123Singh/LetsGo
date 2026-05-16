import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth";
import { useAuth } from "../auth/AuthContext";

export function Register() {
  const navigate = useNavigate();
  const { user, loading: authBusy, finalizeAuthSession } = useAuth();

  useEffect(() => {
    if (!authBusy && user) {
      navigate("/", { replace: true });
    }
  }, [authBusy, user, navigate]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const authResp = await register({ email, password, displayName });
      const ok = await finalizeAuthSession(authResp);
      if (ok) {
        navigate("/", { replace: true });
      } else {
        setError("Account created but could not load your profile. Try signing in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h1>Create account</h1>
        <p className="muted">Email and password. Google sign-in can be added later.</p>
        <form onSubmit={onSubmit} className="form">
          <label>
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
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
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Register"}
          </button>
        </form>
        <p className="footer-link">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
