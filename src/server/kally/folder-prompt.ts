import "server-only";
import { db } from "@/lib/db";
import { listCategories } from "@/server/categories";
import { topicKey, type FolderQuestion } from "@/server/kally/learning";

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
