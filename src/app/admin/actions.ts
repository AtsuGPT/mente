"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { createCategory, deleteCategory, updateCategory } from "@/server/categories";
import { createPost, deletePost, updatePost } from "@/server/posts";
import { setProfileImage } from "@/server/site-settings";
import { detectImageMime } from "@/lib/image-mime";
import { parseCategoryForm, parsePostForm, postSchema, type ActionState } from "@/server/validation";
import { slugify } from "@/lib/slug";
import { z } from "zod";

/** Tudo que é público depende de posts e categorias; invalida o conjunto. */
function revalidateEverything() {
  revalidatePath("/", "layout");
}

const INVALID = "Revise os campos destacados.";

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

export type ChatPublishResult = ActionState & {
  id?: string;
  slug?: string;
  status?: "publish" | "save";
};

/**
 * Publicação a partir do chat da Kally. Usa a mesma validação (postSchema),
 * o mesmo serviço (createPost) e a mesma autorização do editor administrativo.
 */
export async function publishChatDraftAction(input: {
  title: string;
  content: string;
  categoryIds: string[];
  private: boolean;
  intent: "publish" | "save";
}): Promise<ChatPublishResult> {
  await requireAdmin();
  const base = slugify(String(input.title ?? "")) || "pensamento";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parsed = postSchema.safeParse({
      title: String(input.title ?? ""),
      slug: attempt === 0 ? base : `${base.slice(0, 110)}-${attempt + 1}`,
      content: String(input.content ?? ""),
      private: Boolean(input.private),
      categoryIds: Array.isArray(input.categoryIds) ? input.categoryIds.map(String).slice(0, 50) : [],
      publishedAt: null,
      intent: input.intent === "publish" ? "publish" : "save",
    });
    if (!parsed.success) {
      return { ok: false, message: INVALID, fieldErrors: z.flattenError(parsed.error).fieldErrors };
    }
    const result = await createPost(parsed.data);
    if (result.ok) {
      revalidateEverything();
      return {
        ok: true,
        id: result.data.id,
        slug: parsed.data.slug,
        status: parsed.data.intent === "publish" ? "publish" : "save",
        message: parsed.data.intent === "publish" ? "Pensamento publicado." : "Rascunho salvo no painel.",
      };
    }
    // Endereço já usado: tenta o próximo sufixo; outros erros encerram.
    if (!result.fieldErrors?.slug) return { ok: false, message: result.message ?? INVALID, fieldErrors: result.fieldErrors };
  }
  return { ok: false, message: "Não consegui gerar um endereço único para este título. Ajuste o título e tente de novo." };
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
