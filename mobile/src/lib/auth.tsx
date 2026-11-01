import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, setAuthToken, setUnauthorizedHandler } from "./api";
import { deleteItem, getItem, setItem } from "./secure-storage";
import type { Role, SessionInfo } from "./types";

const TOKEN_KEY = "minha-mente.token";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; notice?: string }
  | { status: "offline"; message: string }
  | { status: "signedIn"; session: SessionInfo };

type AuthContextValue = {
  state: AuthState;
  role: Role | null;
  isAdmin: boolean;
  session: SessionInfo | null;
  signIn: (username: string, password: string) => Promise<void>;
  enterAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
  /** Atualiza os dados da sessão (ex.: foto nova) sem passar pela tela de carregamento. */
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const clear = useCallback(async (notice?: string) => {
    setAuthToken(null);
    await deleteItem(TOKEN_KEY);
    setState({ status: "signedOut", notice });
  }, []);

  /** Confere o token com o backend; sem rede, mantém o token e oferece nova tentativa. */
  const restore = useCallback(async () => {
    setState({ status: "loading" });
    const token = await getItem(TOKEN_KEY);
    if (!token) {
      setState({ status: "signedOut" });
      return;
    }
    setAuthToken(token);
    try {
      setState({ status: "signedIn", session: await api.session() });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await clear("Sua sessão expirou. Entre novamente.");
      else setState({ status: "offline", message: cause instanceof Error ? cause.message : "Sem conexão com o servidor." });
    }
  }, [clear]);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear("Sua sessão expirou. Entre novamente."));
    void restore();
    return () => setUnauthorizedHandler(null);
  }, [clear, restore]);

  const start = useCallback(async (token: string) => {
    setAuthToken(token);
    await setItem(TOKEN_KEY, token);
    setState({ status: "signedIn", session: await api.session() });
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const session = state.status === "signedIn" ? state.session : null;
    return {
      state,
      session,
      role: session?.role ?? null,
      isAdmin: !!session?.isAdmin,
      signIn: async (username, password) => start((await api.login(username, password)).token),
      enterAsGuest: async () => start((await api.guest()).token),
      signOut: () => clear(),
      retry: restore,
      refreshSession: async () => setState({ status: "signedIn", session: await api.session() }),
    };
  }, [state, start, clear, restore]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return value;
}
