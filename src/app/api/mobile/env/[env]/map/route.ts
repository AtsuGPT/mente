import { getKnowledgeMap } from "@/server/map";
import { envAccess, json, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mapa do ambiente; quem gerencia o conteúdo também vê os rascunhos. */
export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const map = await getKnowledgeMap(access.scope, { includeDrafts: access.permissions.manageContent });
  return json({ ...map, environment: { id: access.environment.id, name: access.environment.name, color: access.environment.color, icon: access.environment.icon } });
}

export { preflight as OPTIONS } from "../../../_lib/http";
