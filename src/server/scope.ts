import "server-only";
import { getAccessRole } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/role";

/**
 * De qual ambiente uma consulta lê e se ela pode ver pensamentos privados.
 * Toda leitura de pensamentos e categorias recebe um escopo; sem ele, vale o
 * escopo do site (ambiente original "mente" com os papéis dos cookies), então
 * as páginas do site continuam exatamente como antes dos ambientes.
 */

export const DEFAULT_ENVIRONMENT_ID = "mente";

/** viewerId: quem lê. Sem "ver privados", a pessoa ainda vê os privados que ela mesma escreveu. */
export type Scope = { environmentId: string; canSeePrivate: boolean; viewerId?: string | null };

/** Escopo do site: ambiente "mente"; INTIMO e ADMIN veem os privados, como sempre. */
export async function webScope(): Promise<Scope> {
  const role = (await getAccessRole()) ?? ROLES.GUEST;
  return { environmentId: DEFAULT_ENVIRONMENT_ID, canSeePrivate: role === ROLES.ADMIN || role === ROLES.INTIMATE };
}

export async function resolveScope(scope?: Scope): Promise<Scope> {
  return scope ?? webScope();
}

/** Contador da numeração: "posts" é o histórico do ambiente original. */
export function counterId(environmentId: string) {
  return environmentId === DEFAULT_ENVIRONMENT_ID ? "posts" : `posts:${environmentId}`;
}
