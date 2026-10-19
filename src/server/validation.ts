import { z } from "zod";
import { HEX_COLOR } from "@/lib/color";
import { fromDatetimeLocal } from "@/lib/format";
import { SLUG_PATTERN, slugify } from "@/lib/slug";

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe um endereço (slug).")
  .max(120, "No máximo 120 caracteres.")
  .regex(SLUG_PATTERN, "Use apenas letras minúsculas, números e hífens.");

export const POST_INTENTS = ["save", "publish", "unpublish"] as const;
export type PostIntent = (typeof POST_INTENTS)[number];

export const postSchema = z
  .object({
    title: z.string().trim().min(1, "Dê um título ao pensamento.").max(200, "No máximo 200 caracteres."),
    slug: slugField,
    content: z.string().max(200_000, "Texto longo demais."),
    private: z.boolean(),
    categoryIds: z.array(z.string().min(1)).max(50),
    publishedAt: z.date().nullable(),
    intent: z.enum(POST_INTENTS),
  })
  .superRefine((value, ctx) => {
    if (value.intent === "publish" && value.content.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["content"], message: "Escreva o texto antes de publicar." });
    }
  });

export type PostInput = z.infer<typeof postSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(60, "No máximo 60 caracteres."),
  slug: slugField,
  description: z.string().trim().max(280, "No máximo 280 caracteres."),
  color: z.string().trim().regex(HEX_COLOR, "Use o formato #RRGGBB."),
  position: z.coerce.number().int("Use um número inteiro.").min(0).max(999),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
};

/** Lê o formulário do pensamento, com defaults seguros, antes de validar. */
export function parsePostForm(formData: FormData) {
  const title = String(formData.get("title") ?? "");
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const rawDate = String(formData.get("publishedAt") ?? "").trim();

  let publishedAt: Date | null = null;
  let dateError: string | undefined;
  if (rawDate) {
    const d = fromDatetimeLocal(rawDate);
    if (!d) dateError = "Data inválida.";
    else publishedAt = d;
  }

  const result = postSchema.safeParse({
    title,
    slug: rawSlug || slugify(title),
    content: String(formData.get("content") ?? ""),
    private: formData.get("private") === "on",
    categoryIds: formData.getAll("categoryIds").map(String),
    publishedAt,
    intent: String(formData.get("intent") ?? "save"),
  });

  if (!result.success) {
    const fieldErrors: FieldErrors = z.flattenError(result.error).fieldErrors;
    if (dateError) fieldErrors.publishedAt = [dateError];
    return { success: false as const, fieldErrors };
  }
  if (dateError) {
    return { success: false as const, fieldErrors: { publishedAt: [dateError] } as FieldErrors };
  }
  return { success: true as const, data: result.data };
}

export function parseCategoryForm(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const result = categorySchema.safeParse({
    name,
    slug: rawSlug || slugify(name, 60),
    description: String(formData.get("description") ?? ""),
    color: String(formData.get("color") ?? ""),
    position: String(formData.get("position") ?? "0") || "0",
  });
  if (!result.success) {
    return { success: false as const, fieldErrors: z.flattenError(result.error).fieldErrors as FieldErrors };
  }
  return { success: true as const, data: result.data };
}
