import { useCallback, useEffect, useState } from "react";
import { fetchMe, logout as logoutRequest, type AuthUser } from "../services/aiService";

export type AuthState = { status: "loading" } | { status: "anonymous" } | { status: "authenticated"; user: AuthUser };

/** Sessão do GitHub (cookie httpOnly no servidor). `enabled` vem do /api/health. */
export function useAuth(enabled: boolean) {
  const [state, setState] = useState<AuthState>({ status: enabled ? "loading" : "anonymous" });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchMe()
      .then((user) => alive && setState(user ? { status: "authenticated", user } : { status: "anonymous" }))
      .catch(() => alive && setState({ status: "anonymous" }));
    return () => {
      alive = false;
    };
  }, [enabled]);

  // Navegação completa: o servidor redireciona para o GitHub e volta com o cookie de sessão.
  const login = useCallback(() => window.location.assign("/api/auth/login"), []);
  const logout = useCallback(async () => {
    await logoutRequest().catch(() => undefined);
    setState({ status: "anonymous" });
  }, []);

  return { state: enabled ? state : ({ status: "anonymous" } as AuthState), login, logout };
}
