import { restoreVersion } from "@/server/artifacts/store";
import { envAccess, error, json, readJson } from "../../../../../_lib/http";
import { artifactFailure } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

/** { numero }: a versão antiga volta como uma versão nova (nada é apagado). */
export async function POST(request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const number = Number(body.numero);
  if (!Number.isInteger(number) || number < 1) return error("Versão inválida.", 400);
  const { id } = await context.params;
  try {
    return json(await restoreVersion(access, id, number), { status: 201 });
  } catch (cause) {
    return artifactFailure(cause);
  }
}

export { preflight as OPTIONS } from "../../../../../_lib/http";
