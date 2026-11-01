import { parseEnvironmentInput, setArchived, updateEnvironment } from "@/server/environments";
import { envAccess, error, json, readJson, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nome, descrição, cor, ícone e acesso de convidados (só o proprietário). */
export async function PUT(request: Request, context: EnvContext) {
  const access = await envAccess(context, "manageSettings");
  if (access instanceof Response) return access;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = parseEnvironmentInput(body);
  if (!parsed.ok) return error("Revise os campos destacados.", 422, { fieldErrors: parsed.fieldErrors });
  return json({ environment: await updateEnvironment(access.environment.id, parsed.data) });
}

/** Arquivar ou reativar ({ archived: boolean }). Arquivar não apaga nada. */
export async function PATCH(request: Request, context: EnvContext) {
  const access = await envAccess(context, "manageSettings");
  if (access instanceof Response) return access;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const result = await setArchived(access.environment.id, body.archived === true);
  return result.ok ? json({ ok: true }) : error(result.error, 400);
}

export { preflight as OPTIONS } from "../../../_lib/http";
