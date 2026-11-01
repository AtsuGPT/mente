import { revalidatePath } from "next/cache";
import { createPost, listAdminPosts, type AdminStatusFilter } from "@/server/posts";
import { parsePostForm } from "@/server/validation";
import { error, json, requireAdminRequest } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista do painel: ?q=&status=all|draft|published&categoria=<id>&pagina=N */
export async function GET(request: Request) {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;

  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status");
  const status: AdminStatusFilter = statusParam === "draft" || statusParam === "published" ? statusParam : "all";
  return json(
    await listAdminPosts({
      q: params.get("q")?.slice(0, 100) || undefined,
      status,
      categoryId: params.get("categoria") || undefined,
      page: Number(params.get("pagina")) || 1,
    }),
  );
}

/** Cria um pensamento com o mesmo FormData do editor do site. */
export async function POST(request: Request) {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("Não consegui ler o formulário.", 400);
  }

  const parsed = parsePostForm(formData);
  if (!parsed.success) return error("Revise os campos destacados.", 422, { fieldErrors: parsed.fieldErrors });

  const result = await createPost(parsed.data);
  if (!result.ok) return error(result.message ?? "Revise os campos destacados.", 422, { fieldErrors: result.fieldErrors });

  revalidatePath("/", "layout");
  return json({ id: result.data.id }, { status: 201 });
}

export { preflight as OPTIONS } from "../../_lib/http";
