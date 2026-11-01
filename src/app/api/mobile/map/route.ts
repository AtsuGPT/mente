import { getKnowledgeMap } from "@/server/map";
import { json, requireRole } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nós e conexões do mapa do arquivo (ver server/map.ts). */
export async function GET() {
  const role = await requireRole();
  if (role instanceof Response) return role;
  return json(await getKnowledgeMap());
}

export { preflight as OPTIONS } from "../_lib/http";
