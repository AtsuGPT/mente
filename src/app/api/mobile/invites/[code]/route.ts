import { previewInvite, redeemInvite } from "@/server/environments";
import { error, json, requireUser } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

/** Prévia: nome e identidade do ambiente, nunca o conteúdo. Não exige conta. */
export async function GET(_request: Request, context: Context) {
  const preview = await previewInvite(decodeURIComponent((await context.params).code));
  return preview.ok ? json(preview) : error(preview.error, 404);
}

/** Aceita o convite (exige conta). */
export async function POST(_request: Request, context: Context) {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  const result = await redeemInvite(decodeURIComponent((await context.params).code), userId);
  return result.ok ? json(result) : error(result.error, result.status);
}

export { preflight as OPTIONS } from "../../_lib/http";
