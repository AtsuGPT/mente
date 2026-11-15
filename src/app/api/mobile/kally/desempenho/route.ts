import { perfReport } from "@/server/ai/perf-report";
import { findUserById } from "@/server/users";
import { error, json, requireUser } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Desempenho da Kally (logs/kally-perf.jsonl resumido): só para o administrador da plataforma. Para qualquer outra
 * conta, a rota responde como se não existisse.
 */
export async function GET() {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  if ((await findUserById(userId))?.legacyKind !== "ADMIN") return error("Não encontrado.", 404);
  return json(await perfReport());
}
