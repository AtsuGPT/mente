import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, setAuthToken, setUnauthorizedHandler } from "./api";
import { deleteItem, getItem, setItem } from "./secure-storage";
import type { User } from "./types";

/**
 * Sessão da pessoa (não do ambiente). Sem conta, o app não manda token e o
 * servidor a trata como visitante: só lê ambientes que aceitam convidados.
 */

const TOKEN_KEY = "minha-mente.token.v2";

type AuthState =
  | { status: "loading" }
  | { status: "ready"; user: User | null; notice?: string }
  | { status: "offline"; message: string };

type AuthContextValue = {
  state: AuthState;
  user: User | null;
  signIn: (username: string, password: string) => Promise<void>;
  register: (input: { username: string; displayName: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const clear = useCallback(async (notice?: string) => {
    setAuthToken(null);
    await deleteItem(TOKEN_KEY);
    setState({ status: "ready", user: null, notice });
  }, []);

  /** Confere o token com o backend; sem rede, mantém o token e oferece nova tentativa. */
  const restore = useCallback(async () => {
    setState({ status: "loading" });
    const token = await getItem(TOKEN_KEY);
    if (!token) {
      setState({ status: "ready", user: null });
      return;
    }
    setAuthToken(token);
    try {
      setState({ status: "ready", user: (await api.me()).user });
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

  const start = useCallback(async (token: string, user: User) => {
    setAuthToken(token);
    await setItem(TOKEN_KEY, token);
    setState({ status: "ready", user });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user: state.status === "ready" ? state.user : null,
      signIn: async (username, password) => {
        const result = await api.login(username, password);
        await start(result.token, result.user);
      },
      register: async (input) => {
        const result = await api.register(input);
        await start(result.token, result.user);
      },
      signOut: () => clear(),
      retry: restore,
    }),
    [state, start, clear, restore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return value;
}
