import { getVersion } from "@/server/artifacts/store";
import { envAccess, error, json } from "../../../../../../_lib/http";
import { artifactFailure } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string; numero: string }> };

/** O código de uma versão antiga (para ver antes de restaurar). */
export async function GET(_request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const { id, numero } = await context.params;
  const number = Number(numero);
  if (!Number.isInteger(number) || number < 1) return error("Versão não encontrada.", 404);
  try {
    return json({ version: await getVersion(access, id, number) });
  } catch (cause) {
    return artifactFailure(cause);
  }
}

export { preflight as OPTIONS } from "../../../../../../_lib/http";
