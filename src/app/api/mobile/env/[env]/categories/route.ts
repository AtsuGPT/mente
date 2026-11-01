import { listCategoriesWithPublicCounts } from "@/server/categories";
import { envAccess, json, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  return json({ categories: await listCategoriesWithPublicCounts(access.scope) });
}

export { preflight as OPTIONS } from "../../../_lib/http";
