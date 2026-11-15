import { deleteArtifact, getArtifact, updateArtifact } from "@/server/artifacts/store";
import { envAccess, json, readJson } from "../../../../_lib/http";
import { artifactFailure, str } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

/** O artefato (código da versão atual) e a lista de versões. */
export async function GET(_request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const { id } = await context.params;
  try {
    return json(await getArtifact(access, id));
  } catch (cause) {
    return artifactFailure(cause);
  }
}

/** Metadados: { title?, description?, category?, private?, kind? } (o código só muda por versão nova). */
export async function PATCH(request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    return json(
      await updateArtifact(access, id, {
        title: str(body.title),
        description: str(body.description),
        category: str(body.category),
        private: typeof body.private === "boolean" ? body.private : undefined,
        kind: str(body.kind),
      }),
    );
  } catch (cause) {
    return artifactFailure(cause);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const { id } = await context.params;
  try {
    return json(await deleteArtifact(access, id));
  } catch (cause) {
    return artifactFailure(cause);
  }
}

export { preflight as OPTIONS } from "../../../../_lib/http";
