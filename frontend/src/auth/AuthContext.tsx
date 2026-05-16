import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken, getToken } from "../api/client";
import { fetchMe, type UserResponse } from "../api/auth";

type AuthState = {
  user: UserResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<boolean>;
  signOut: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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
      setError(e instanceof Error ? e.message : "Could not load profile");
      setUser(null);
      clearToken();
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
    navigate("/login", { replace: true });
  }, [navigate]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, error, refresh, signOut }),
    [user, loading, error, refresh, signOut]
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
