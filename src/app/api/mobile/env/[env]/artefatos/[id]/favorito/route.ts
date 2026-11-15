import { setFavorite } from "@/server/artifacts/store";
import { envAccess, json } from "../../../../../_lib/http";
import { artifactFailure } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

async function toggle(context: Context, on: boolean) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const { id } = await context.params;
  try {
    return json(await setFavorite(access, id, on));
  } catch (cause) {
    return artifactFailure(cause);
  }
}

/** PUT favorita, DELETE desfaz. */
export async function PUT(_request: Request, context: Context) {
  return toggle(context, true);
}

export async function DELETE(_request: Request, context: Context) {
  return toggle(context, false);
}

export { preflight as OPTIONS } from "../../../../../_lib/http";
