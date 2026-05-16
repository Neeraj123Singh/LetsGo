import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken, getToken } from "../api/client";
import { fetchMe, type AuthResponse, type UserResponse, isApiHttpError } from "../api/auth";

type AuthState = {
  user: UserResponse | null;
  loading: boolean;
  error: string | null;
  /** Load user from saved token only (startup / sanity check). */
  refresh: () => Promise<boolean>;
  /** After login/register: hydrate profile from /me when possible; otherwise trust credential payload so redirect still works. */
  finalizeAuthSession: (credential: AuthResponse) => Promise<boolean>;
  signOut: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const finalizeAuthSession = useCallback(async (credential: AuthResponse): Promise<boolean> => {
    setError(null);
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return false;
    }
    try {
      const me = await fetchMe();
      setUser(me);
      return true;
    } catch (e) {
      const status = isApiHttpError(e) ? e.status : undefined;
      if (status === 401 || status === 403) {
        setUser(null);
        clearToken();
        setError(e instanceof Error ? e.message : "Could not verify session");
        return false;
      }
      setUser({
        id: credential.userId,
        email: credential.email,
        displayName: credential.displayName,
        createdAt: "",
      });
      setError(null);
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return false;
    }
    try {
      const me = await fetchMe();
      setUser(me);
      return true;
    } catch (e) {
      const status = isApiHttpError(e) ? e.status : undefined;
      setError(e instanceof Error ? e.message : "Could not load profile");
      setUser(null);
      if (status === 401 || status === 403) {
        clearToken();
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
    setLoading(false);
    navigate("/login", { replace: true });
  }, [navigate]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      error,
      refresh,
      finalizeAuthSession,
      signOut,
    }),
    [user, loading, error, refresh, finalizeAuthSession, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return v;
}
