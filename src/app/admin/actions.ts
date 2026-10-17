"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { createCategory, deleteCategory, updateCategory } from "@/server/categories";
import { createPost, deletePost, updatePost } from "@/server/posts";
import { parseCategoryForm, parsePostForm, type ActionState } from "@/server/validation";

/** Tudo que é público depende de posts e categorias; invalida o conjunto. */
function revalidateEverything() {
  revalidatePath("/", "layout");
}

const INVALID = "Revise os campos destacados.";

/* ------------------------------ Pensamentos ----------------------------- */

export async function savePostAction(id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const parsed = parsePostForm(formData);
  if (!parsed.success) return { ok: false, message: INVALID, fieldErrors: parsed.fieldErrors };

  const result = id ? await updatePost(id, parsed.data) : await createPost(parsed.data);
  if (!result.ok) {
    return { ok: false, message: result.message ?? INVALID, fieldErrors: result.fieldErrors };
  }

  revalidateEverything();

  if (!id) redirect(`/admin/pensamentos/${result.data.id}?criado=${parsed.data.intent}`);

  const message =
    parsed.data.intent === "publish"
      ? "Pensamento publicado."
      : parsed.data.intent === "unpublish"
        ? "Voltou para rascunho."
        : "Alterações salvas.";
  return { ok: true, message };
}

export async function deletePostAction(id: string) {
  await requireAdmin();
  await deletePost(id);
  revalidateEverything();
  redirect("/admin?excluido=1");
}

/* ------------------------------- Categorias ----------------------------- */

export async function saveCategoryAction(
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = parseCategoryForm(formData);
  if (!parsed.success) return { ok: false, message: INVALID, fieldErrors: parsed.fieldErrors };

  const result = id ? await updateCategory(id, parsed.data) : await createCategory(parsed.data);
  if (!result.ok) {
    return { ok: false, message: result.message ?? INVALID, fieldErrors: result.fieldErrors };
  }

  revalidateEverything();
  return { ok: true, message: id ? "Categoria salva." : "Categoria criada." };
}

export async function deleteCategoryAction(id: string) {
  await requireAdmin();
  await deleteCategory(id);
  revalidateEverything();
}
