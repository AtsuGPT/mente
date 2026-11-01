import { listCategoriesWithPublicCounts } from "@/server/categories";
import { json, requireRole } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pastas do arquivo, com a contagem visível para o papel de quem pede. */
export async function GET() {
  const role = await requireRole();
  if (role instanceof Response) return role;
  return json({ categories: await listCategoriesWithPublicCounts() });
}

export { preflight as OPTIONS } from "../_lib/http";
