"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { createCategory, deleteCategory, updateCategory } from "@/server/categories";
import { createPost, deletePost, updatePost } from "@/server/posts";
import { setProfileImage } from "@/server/site-settings";
import { parseCategoryForm, parsePostForm, type ActionState } from "@/server/validation";

/** Tudo que é público depende de posts e categorias; invalida o conjunto. */
function revalidateEverything() {
  revalidatePath("/", "layout");
}

const INVALID = "Revise os campos destacados.";

function detectImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export async function saveProfileImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  if (formData.get("intent") === "remove") {
    await setProfileImage(null);
    revalidateEverything();
    revalidatePath("/admin/configuracoes");
    return { ok: true, message: "Foto removida." };
  }

  const file = formData.get("profileImage");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Escolha uma imagem para enviar." };
  }
  if (file.size > 700 * 1024) {
    return { ok: false, message: "A imagem deve ter no máximo 700 KB." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = detectImageMime(bytes);
  if (!mime) {
    return { ok: false, message: "Envie uma imagem JPG, PNG ou WebP válida." };
  }

  await setProfileImage(`data:${mime};base64,${bytes.toString("base64")}`);
  revalidateEverything();
  revalidatePath("/admin/configuracoes");
  return { ok: true, message: "Foto de perfil atualizada." };
}

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
