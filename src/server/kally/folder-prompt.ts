import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { createCategory, listCategories, type CategorySummary } from "@/server/categories";
import { topicKey, type FolderQuestion } from "@/server/kally/learning";
import { categorySchema } from "@/server/validation";

/** Resposta do cartão: pasta existente, pasta nova com nome, ou "agora não". */
export type FolderChoice = { kind: "existente"; categoryId: string } | { kind: "nova"; name: string } | { kind: "recusa" };

/** Lê a escolha que o app mandou (nada do corpo entra no banco sem validar). */
export function folderChoiceFrom(value: unknown): FolderChoice | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.kind === "recusa") return { kind: "recusa" };
  if (v.kind === "existente" && typeof v.categoryId === "string" && v.categoryId.length <= 64) return { kind: "existente", categoryId: v.categoryId };
  if (v.kind === "nova" && typeof v.name === "string") {
    const name = v.name.replace(/\s+/g, " ").trim();
    if (name && name.length <= 60) return { kind: "nova", name };
  }
  return null;
}

/** Cor das pastas criadas pelo cartão: a mesma do formulário de pastas do app. */
const NEW_FOLDER_COLOR = "#7C5CE0";

export type FolderSaveResult =
  | { ok: true; category: CategorySummary | null; moved: number }
  | { ok: false; status: 403 | 404 | 422; message: string };

/**
 * Guarda a conversa na pasta (etapa 4). No sim, a conversa e os tópicos dela que ainda não têm pasta passam para a
 * pasta juntos, numa transação (decisão 4); os tópicos novos herdam depois, em learning.ts. Na recusa, a Kally não
 * pergunta de novo nesta conversa (decisão 2). Trocar a pasta de uma conversa que já tem uma fica fora (decisão 6).
 */
export async function saveConversationToFolder(input: { environmentId: string; userId: string; conversationId: string; canCreate: boolean; choice: FolderChoice }): Promise<FolderSaveResult> {
  const conversation = await db.kallyConversation.findFirst({ where: { id: input.conversationId, environmentId: input.environmentId, userId: input.userId }, select: { id: true, categoryId: true } });
  if (!conversation) return { ok: false, status: 404, message: "Conversa não encontrada." };
  const { choice } = input;
  if (choice.kind === "recusa") {
    await db.kallyConversation.update({ where: { id: conversation.id }, data: { folderDeclined: true } });
    return { ok: true, category: null, moved: 0 };
  }
  if (conversation.categoryId) return { ok: false, status: 422, message: "Esta conversa já está numa pasta." };

  let category: CategorySummary | null;
  if (choice.kind === "existente") {
    category = (await listCategories(input.environmentId)).find((c) => c.id === choice.categoryId) ?? null;
    if (!category) return { ok: false, status: 404, message: "Pasta não encontrada." };
  } else {
    if (!input.canCreate) return { ok: false, status: 403, message: "Você não pode criar pastas neste ambiente. Escolha uma das existentes." };
    const existing = await listCategories(input.environmentId);
    const same = existing.find((c) => topicKey(c.name) === topicKey(choice.name));
    if (same) category = same;
    else {
      const parsed = categorySchema.safeParse({ name: choice.name, slug: slugify(choice.name, 60) || "pasta", description: "", color: NEW_FOLDER_COLOR, position: Math.min(999, existing.reduce((max, c) => Math.max(max, c.position), -1) + 1) });
      if (!parsed.success) return { ok: false, status: 422, message: "Nome de pasta inválido." };
      const created = await createCategory(parsed.data, input.environmentId);
      if (!created.ok) return { ok: false, status: 422, message: created.message ?? "Já existe uma pasta com esse endereço. Escolha outro nome." };
      category = created.data;
    }
  }

  const [, topics] = await db.$transaction([
    db.kallyConversation.update({ where: { id: conversation.id }, data: { categoryId: category.id } }),
    db.kallyLearningTopic.updateMany({ where: { conversationId: conversation.id, environmentId: input.environmentId, userId: input.userId, categoryId: null }, data: { categoryId: category.id } }),
  ]);
  return { ok: true, category, moved: topics.count };
}

/**
 * Cartão da pasta (pasta como centro, 26/11/2026): quando nasce um tópico numa conversa sem pasta, ou quando a pessoa
 * pede para guardar o tópico, a rota da Kally manda ao app o evento `folderPrompt`. O app mostra o cartão com as pastas
 * do ambiente e, para quem pode criar pasta, um campo com o nome sugerido (editável). A resposta vai para a rota
 * `kally/[id]/pasta`.
 */
export type FolderPrompt = {
  conversationId: string;
  /** o tópico que motivou a pergunta; null quando a conversa ainda não tem tópico (pedido explícito) */
  topicId: string | null;
  topicTitle: string;
  /** nome já preenchido no campo de pasta nova (decisão 5) */
  suggestedName: string;
  folders: { id: string; name: string; color: string }[];
  /** criar pasta exige gerenciar conteúdo, como na rota de gerenciar pastas */
  canCreate: boolean;
};

const SAVE_VERB = /\b(salv|guard|coloc|p[oõ]e|p[oô]r|bot|mov|adicion|arquiv)\w*/;
const TARGET = /\b(t[oó]pico|assunto|tema|pasta)s?\b/;

/**
 * "salva esse tópico", "guarda isso numa pasta", "coloca esse assunto na pasta de Física": a pessoa chama o cartão
 * (decisão 2: depois de "agora não", a Kally não pergunta de novo; quem quiser guardar pede). Só mensagens curtas, para
 * não pegar pedidos de estudo que falam de pasta ("me explica o que é uma pasta no Linux").
 */
export function asksSaveTopic(message: string) {
  const m = message.toLowerCase().trim();
  if (m.length > 120 || (m.includes("?") && !/\b(pode|consegue)\b/.test(m))) return false;
  if (/\b(o que [eé]|explica|como funciona|significa)\b/.test(m)) return false;
  return SAVE_VERB.test(m) && TARGET.test(m) && /\b(pasta|salv|guard)\w*/.test(m);
}

/** Monta o evento do cartão. Sem tópico dado (pedido explícito), usa o tópico mais recente da conversa, ou o título dela. */
export async function folderPromptFor(input: { environmentId: string; userId: string; canCreate: boolean; conversation: { id: string; title: string }; question?: FolderQuestion | null }): Promise<FolderPrompt> {
  const latest = input.question
    ? null
    : await db.kallyLearningTopic.findFirst({ where: { conversationId: input.conversation.id, environmentId: input.environmentId, userId: input.userId }, orderBy: { lastStudiedAt: "desc" }, select: { id: true, title: true } });
  const topicId = input.question?.topicId ?? latest?.id ?? null;
  const topicTitle = input.question?.topicTitle ?? latest?.title ?? input.conversation.title;
  const folders = (await listCategories(input.environmentId)).map((c) => ({ id: c.id, name: c.name, color: c.color }));
  return { conversationId: input.conversation.id, topicId, topicTitle, suggestedName: suggestedFolderName(topicTitle, folders), folders, canCreate: input.canCreate };
}

/** Resposta ao pedido de guardar o tópico: o cartão, ou o motivo de não haver cartão (conversa temporária ou já na pasta). */
export async function saveTopicReply(input: { environmentId: string; userId: string; canCreate: boolean; conversation: { id: string; title: string; categoryId: string | null } | null }) {
  const { conversation } = input;
  if (!conversation) return { text: "Para guardar numa pasta, salve esta conversa primeiro. Conversa temporária não guarda tópicos.", folderPrompt: null };
  if (conversation.categoryId) {
    const folder = await db.category.findFirst({ where: { id: conversation.categoryId, environmentId: input.environmentId }, select: { name: true } });
    if (folder) return { text: `Esta conversa já está na pasta **${folder.name}**: os tópicos dela já ficam guardados lá.`, folderPrompt: null };
  }
  const folderPrompt = await folderPromptFor({ ...input, conversation });
  return { text: "Escolha a pasta no cartão.", folderPrompt };
}

/** O título do tópico com a primeira letra maiúscula; se já houver pasta com esse nome, o campo vem vazio de sugestão repetida. */
export function suggestedFolderName(topicTitle: string, folders: { name: string }[]) {
  const name = topicTitle.replace(/\s+/g, " ").trim().slice(0, 60);
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  return folders.some((f) => topicKey(f.name) === topicKey(capitalized)) ? "" : capitalized;
}
