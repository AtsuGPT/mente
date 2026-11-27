import { getKnowledgeGraph } from "@/server/knowledge/load";
import { envAccess, json, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mapa de Conhecimento do ambiente (src/server/knowledge): temas, tópicos e materiais que quem pede pode ver, com as
 * relações que existem nos dados. Montado no servidor, sem IA; nada privado sai sem permissão.
 */
export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  return json(await getKnowledgeGraph(access));
}

export { preflight as OPTIONS } from "../../../_lib/http";
