import { revalidatePath } from "next/cache";
import { createCategory, listCategoriesWithAllCounts } from "@/server/categories";
import { parseCategoryForm } from "@/server/validation";
import { error, json, requireAdminRequest } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Todas as categorias, com a contagem total (inclui rascunhos). */
export async function GET() {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;
  return json({ categories: await listCategoriesWithAllCounts() });
}

export async function POST(request: Request) {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("Não consegui ler o formulário.", 400);
  }

  const parsed = parseCategoryForm(formData);
  if (!parsed.success) return error("Revise os campos destacados.", 422, { fieldErrors: parsed.fieldErrors });

  const result = await createCategory(parsed.data);
  if (!result.ok) return error(result.message ?? "Revise os campos destacados.", 422, { fieldErrors: result.fieldErrors });

  revalidatePath("/", "layout");
  return json({ category: result.data }, { status: 201 });
}

export { preflight as OPTIONS } from "../../_lib/http";
