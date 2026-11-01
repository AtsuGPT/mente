import { leaveEnvironment } from "@/server/environments";
import { envAccess, error, json, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sair do ambiente por conta própria. */
export async function POST(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const result = await leaveEnvironment(access);
  return result.ok ? json({ ok: true }) : error(result.error, result.status);
}

export { preflight as OPTIONS } from "../../../_lib/http";
