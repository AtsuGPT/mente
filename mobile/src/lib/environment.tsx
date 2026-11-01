import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { envApi, type EnvApi } from "./api";
import { useAuth } from "./auth";
import { getItem, setItem } from "./secure-storage";
import type { EnvironmentSession } from "./types";

/**
 * Ambiente em que a pessoa está. Entrar busca a sessão do ambiente no servidor
 * (papel e permissões); sair limpa tudo, e as telas do ambiente são desmontadas,
 * então nada de um ambiente aparece em outro.
 *
 * "pending" guarda o que a pessoa queria abrir antes de precisar entrar com a conta
 * (um ambiente privado ou um convite), para retomar logo depois do login.
 */

const LAST_KEY = "minha-mente.last-environment";

export type Pending = { kind: "environment"; id: string; name: string } | { kind: "invite"; code: string; name: string } | null;

type Current = { api: EnvApi; session: EnvironmentSession };

type EnvironmentContextValue = {
  current: Current | null;
  lastEnvironmentId: string | null;
  pending: Pending;
  setPending: (pending: Pending) => void;
  enter: (environmentId: string) => Promise<void>;
  exit: () => void;
  /** Recarrega papel/permissões/identidade do ambiente atual (ex.: depois de editar as configurações). */
  refresh: () => Promise<void>;
};

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [current, setCurrent] = useState<Current | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [lastEnvironmentId, setLastEnvironmentId] = useState<string | null>(null);
  const userRef = useRef(user?.id ?? null);

  useEffect(() => {
    void getItem(LAST_KEY).then(setLastEnvironmentId).catch(() => undefined);
  }, []);

  // Trocar de conta (ou sair) fecha o ambiente: as permissões eram da pessoa anterior.
  useEffect(() => {
    if (userRef.current !== (user?.id ?? null)) {
      userRef.current = user?.id ?? null;
      setCurrent(null);
    }
  }, [user?.id]);

  const enter = useCallback(async (environmentId: string) => {
    const scoped = envApi(environmentId);
    const session = await scoped.session(); // 401/403/404 sobem para quem chamou
    setCurrent({ api: envApi(session.environment.id), session });
    setLastEnvironmentId(session.environment.id);
    await setItem(LAST_KEY, session.environment.id).catch(() => undefined);
  }, []);

  const refresh = useCallback(async () => {
    if (!current) return;
    const session = await current.api.session();
    setCurrent({ api: current.api, session });
  }, [current]);

  // Estável de propósito: telas usam exit em efeitos de foco; uma função nova a cada
  // mudança de ambiente faria o efeito rodar de novo e fechar o ambiente recém-aberto.
  const exit = useCallback(() => setCurrent(null), []);

  const value = useMemo<EnvironmentContextValue>(
    () => ({ current, lastEnvironmentId, pending, setPending, enter, exit, refresh }),
    [current, lastEnvironmentId, pending, enter, exit, refresh],
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment() {
  const value = useContext(EnvironmentContext);
  if (!value) throw new Error("useEnvironment precisa estar dentro de <EnvironmentProvider>.");
  return value;
}

/** Para as telas de dentro de um ambiente: sempre há um ambiente atual ali. */
export function useCurrentEnvironment() {
  const { current, refresh, exit } = useEnvironment();
  if (!current) throw new Error("Esta tela só existe dentro de um ambiente.");
  const { session, api } = current;
  return { api, session, environment: session.environment, permissions: session.permissions, role: session.role, refresh, exit };
}
