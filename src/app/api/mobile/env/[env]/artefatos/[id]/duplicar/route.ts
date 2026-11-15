import { duplicateArtifact } from "@/server/artifacts/store";
import { envAccess, json } from "../../../../../_lib/http";
import { artifactFailure } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

/** Cópia independente no mesmo ambiente, com a versão atual como versão 1. */
export async function POST(_request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const { id } = await context.params;
  try {
    return json(await duplicateArtifact(access, id), { status: 201 });
  } catch (cause) {
    return artifactFailure(cause);
  }
}

export { preflight as OPTIONS } from "../../../../../_lib/http";
