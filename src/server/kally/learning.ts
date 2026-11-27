import "server-only";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";

/**
 * Memória de aprendizagem da Kally (17/11/2026): o que a pessoa estudou, com que resultado, onde tropeça e o que
 * vale revisar. Fonte de verdade no banco (KallyLearningTopic / KallyLearningEvent), por pessoa e por ambiente.
 *
 *   progresso  = o que foi visto (explicações, dúvidas): nunca vira "dominado" sozinho;
 *   domínio    = evidência de acerto em quiz (ver masteryOf).
 *
 * Só conversas salvas gravam (como a memória pessoal, memory.ts): conversa temporária não deixa rastro. No prompt entra
 * só um resumo curto dos assuntos ligados à mensagem, nunca o histórico inteiro.
 */

export type Mastery = "estudando" | "dificuldade" | "dominado";

const DAY = 24 * 60 * 60 * 1000;

/** Chave do assunto: minúsculo, sem acento, sem artigo no começo e sem pontuação. */
export function topicKey(title: string) {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/^(o|a|os|as|um|uma|sobre|de|do|da)\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * Assunto de um pedido de estudo sem o interpretador ("me explica o que é inconsciente pra Freud" → "inconsciente pra
 * freud"). Devolve null quando não sobra um assunto claro (melhor não registrar do que registrar errado).
 */
export function topicFromMessage(message: string): string | null {
  const m = message
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/^(kally,? |mano,? |cara,? )/, "")
    .replace(/^(me |você pode me |vc pode me |pode me |quero |queria |preciso )?(explica(r)?|expli\w*|ensina(r)?|ensine|aprender|entender|saber|estudar)\s+(o que (é|e|são) |o q (é|e) |oq (é|e) |q q (é|e) |como funciona(m)? |sobre |os |as |a |o )?/, "")
    .replace(/^(o que (é|e|são)|oq (é|e)|o q (é|e)|como funciona(m)?|qual a diferença entre|diferença entre)\s+/, "")
    .replace(/^(o|a|os|as|um|uma)\s+/, "")
    .replace(/\s+(do zero|pra mim|para mim|de um jeito simples|com calma|direito)$/, "")
    .trim();
  const words = m.split(/\s+/).filter(Boolean);
  // Sobrou só o próprio pedido ("me explica", "quero entender"): sem assunto.
  if (!words.length || words.length > 6 || m.length < 3 || /^(me |pode |quero |queria )?(expli\w*|ensin\w*|entender|aprender|saber|estudar)$/.test(m)) return null;
  return m;
}

/** Domínio pela evidência: 2+ quizzes, 6+ questões, último quiz ≥ 80% e acerto total ≥ 75%. */
export function masteryOf(t: { quizzes: number; questions: number; correct: number; lastScore: number | null; doubts: number }): Mastery {
  if (t.quizzes >= 2 && t.questions >= 6 && (t.lastScore ?? 0) >= 0.8 && t.correct / t.questions >= 0.75) return "dominado";
  if ((t.lastScore !== null && t.lastScore < 0.6) || (t.doubts >= 2 && (t.lastScore ?? 0) < 0.8)) return "dificuldade";
  return "estudando";
}

/** Próxima revisão: em dificuldade, amanhã; estudando, em 3 dias; dominado, em 7 (repetição espaçada simples). */
export function nextReview(mastery: Mastery, now = new Date()) {
  return new Date(now.getTime() + (mastery === "dificuldade" ? 1 : mastery === "estudando" ? 3 : 7) * DAY);
}

/** A Kally pergunta em que pasta guardar só quando o tópico acabou de nascer, a conversa ainda não tem pasta
 *  e a pessoa não recusou nesta conversa. Depois de "agora não", quem quiser guardar pede o cartão. */
export function shouldAskFolder(created: boolean, hasFolder: boolean, declined: boolean): boolean {
  return created && !hasFolder && !declined;
}

type Who = { environmentId: string; userId: string };

/** Tópico que acabou de nascer numa conversa sem pasta: a rota manda o cartão da pasta ao app (pasta como centro). */
export type FolderQuestion = { topicId: string; topicTitle: string };

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * O tópico do assunto, criado se ainda não existir. Ao nascer, herda a pasta da conversa e guarda de que conversa veio
 * (é por ela que, no sim do cartão, todos os tópicos da conversa vão para a pasta). Procura e cria em dois passos, em
 * vez de upsert, porque é preciso saber se o tópico nasceu agora: só aí cabe perguntar a pasta.
 */
async function topicFor(who: Who, title: string, conversationId: string | null) {
  const key = topicKey(title);
  if (!key) return null;
  const clean = title.trim().slice(0, 60);
  const conversation = conversationId
    ? await db.kallyConversation.findFirst({ where: { id: conversationId, environmentId: who.environmentId, userId: who.userId }, select: { id: true, categoryId: true, folderDeclined: true } })
    : null;
  const where = { environmentId_userId_key: { environmentId: who.environmentId, userId: who.userId, key } };
  let topic = await db.kallyLearningTopic.findUnique({ where });
  let created = false;
  if (!topic) {
    try {
      topic = await db.kallyLearningTopic.create({
        data: { environmentId: who.environmentId, userId: who.userId, key, title: clean, nextReviewAt: nextReview("estudando"), conversationId: conversation?.id ?? null, categoryId: conversation?.categoryId ?? null },
      });
      created = true;
    } catch (error) {
      // Duas mensagens criando o mesmo assunto ao mesmo tempo: a outra criou primeiro; usa o dela.
      if (!isUniqueViolation(error)) throw error;
      topic = await db.kallyLearningTopic.findUniqueOrThrow({ where });
    }
  }
  // O nome tirado do pedido vem em minúsculas ("lei de ohm"); o do quiz ou do interpretador ("Lei de Ohm") prevalece.
  if (topic.title === topic.title.toLowerCase() && clean !== clean.toLowerCase()) topic = await db.kallyLearningTopic.update({ where: { id: topic.id }, data: { title: clean } });
  const askFolder = conversation ? shouldAskFolder(created, conversation.categoryId !== null, conversation.folderDeclined) : false;
  return { topic, folder: askFolder ? { topicId: topic.id, topicTitle: topic.title } : null };
}

/** A Kally explicou o assunto (progresso, não domínio). Devolve a pergunta da pasta, quando couber. */
export async function recordExplanation(who: Who, title: string, conversationId: string | null): Promise<FolderQuestion | null> {
  const found = await topicFor(who, title, conversationId);
  if (!found) return null;
  const t = found.topic;
  await db.$transaction([
    db.kallyLearningEvent.create({ data: { topicId: t.id, kind: "explicacao", conversationId } }),
    db.kallyLearningTopic.update({ where: { id: t.id }, data: { explanations: { increment: 1 }, lastStudiedAt: new Date() } }),
  ]);
  return found.folder;
}

/** A pessoa não entendeu algo do assunto. Devolve a pergunta da pasta, quando couber. */
export async function recordDoubt(who: Who, title: string, detail: string, conversationId: string | null): Promise<FolderQuestion | null> {
  const found = await topicFor(who, title, conversationId);
  if (!found) return null;
  const t = found.topic;
  const mastery = masteryOf({ ...t, doubts: t.doubts + 1 });
  await db.$transaction([
    db.kallyLearningEvent.create({ data: { topicId: t.id, kind: "duvida", detail: detail.slice(0, 300), conversationId } }),
    db.kallyLearningTopic.update({ where: { id: t.id }, data: { doubts: { increment: 1 }, mastery, lastStudiedAt: new Date(), nextReviewAt: nextReview(mastery) } }),
  ]);
  return found.folder;
}

export type QuizResult = { tema: string; total: number; correct: number; wrong: string[] };

/** Valida o resultado de quiz que o app manda (nada do cliente entra no banco sem limite). */
export function quizResultFrom(value: unknown): QuizResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const total = Number(v.total);
  const correct = Number(v.correct);
  const tema = typeof v.tema === "string" ? v.tema.trim().slice(0, 60) : "";
  if (!Number.isInteger(total) || !Number.isInteger(correct) || total < 1 || total > 30 || correct < 0 || correct > total || !tema) return null;
  const wrong = Array.isArray(v.wrong) ? v.wrong.filter((w): w is string => typeof w === "string").map((w) => w.slice(0, 200)).slice(0, 10) : [];
  return { tema, total, correct, wrong };
}

/** Resultado de um quiz: a evidência que move o domínio. */
export async function recordQuiz(who: Who, result: QuizResult, conversationId: string | null): Promise<{ mastery: Mastery; folder: FolderQuestion | null } | null> {
  const found = await topicFor(who, result.tema, conversationId);
  if (!found) return null;
  const t = found.topic;
  const next = { quizzes: t.quizzes + 1, questions: t.questions + result.total, correct: t.correct + result.correct, lastScore: result.correct / result.total, doubts: t.doubts };
  const mastery = masteryOf(next);
  const weak = [...result.wrong, ...t.weakPoints.split("\n").filter(Boolean)].filter((w, i, all) => all.indexOf(w) === i).slice(0, 5).join("\n");
  await db.$transaction([
    db.kallyLearningEvent.create({ data: { topicId: t.id, kind: "quiz", correct: result.correct, total: result.total, detail: result.wrong.join("\n").slice(0, 1_000), conversationId } }),
    db.kallyLearningTopic.update({ where: { id: t.id }, data: { ...next, mastery, weakPoints: weak, lastStudiedAt: new Date(), nextReviewAt: nextReview(mastery) } }),
  ]);
  return { mastery, folder: found.folder };
}

/** Progresso da pessoa; com categoryId, só os tópicos daquela pasta (tela da pasta). */
export async function listLearning(who: Who, categoryId: string | null = null) {
  return db.kallyLearningTopic.findMany({ where: { environmentId: who.environmentId, userId: who.userId, ...(categoryId ? { categoryId } : {}) }, orderBy: { lastStudiedAt: "desc" }, take: 60 });
}

export async function clearLearning(who: Who) {
  await db.kallyLearningTopic.deleteMany({ where: { environmentId: who.environmentId, userId: who.userId } });
}

/** A pessoa pergunta pelo próprio progresso ("o que eu já estudei?", "meu progresso", "o que devo revisar?"). */
export const asksProgress = (message: string) =>
  /\b(meu progresso|meus estudos|o que (eu )?j[aá] estudei|o que (eu )?(devo|preciso|deveria) revisar|o que revisar|como (estou|t[oô]|to) (indo|nos estudos)|quais assuntos (eu )?(j[aá] )?(estudei|vi))\b/i.test(message);

const dateBr = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);

function describe(t: Awaited<ReturnType<typeof listLearning>>[number]) {
  const parts = [
    t.quizzes ? `${t.quizzes} quiz${t.quizzes > 1 ? "zes" : ""}, ${t.correct} de ${t.questions} certas${t.lastScore !== null ? ` (último: ${Math.round(t.lastScore * 100)}%)` : ""}` : "sem quiz ainda",
    t.explanations ? `explicado ${t.explanations}×` : "",
    t.doubts ? `${t.doubts} dúvida${t.doubts > 1 ? "s" : ""}` : "",
    t.weakPoints ? `errou: ${t.weakPoints.split("\n").slice(0, 2).join("; ")}` : "",
    `última vez ${dateBr(t.lastStudiedAt)}`,
  ].filter(Boolean);
  return `${t.title} — ${t.mastery}; ${parts.join("; ")}`;
}

/** Assuntos ligados à mensagem: pela chave do tema ou por palavras do título que aparecem na mensagem. */
function related(topics: Awaited<ReturnType<typeof listLearning>>, message: string, theme: string | null) {
  const key = theme ? topicKey(theme) : "";
  const msg = topicKey(message);
  return topics.filter((t) => (key && (t.key === key || t.key.includes(key) || key.includes(t.key))) || t.key.split(" ").filter((w) => w.length >= 5).some((w) => msg.includes(w))).slice(0, 2);
}

/**
 * Contexto de aprendizagem para o prompt (curto) e, se for o caso, uma sugestão de revisão. Só em pedidos de estudo ou
 * quando a pessoa pergunta pelo progresso; no papo, nada (a memória não pode ser invasiva).
 */
export async function learningContext(who: Who, input: { message: string; theme: string | null; studying: boolean; lastAssistant: string | null }) {
  const progress = asksProgress(input.message);
  if (!progress && !input.studying) return { guide: null as string | null, block: null as string | null };
  const topics = await listLearning(who);
  if (!topics.length) return { guide: progress ? "PROGRESSO DE ESTUDO (dados reais): ainda não há assuntos registrados (o registro vale para conversas salvas). Diga isso com naturalidade." : null, block: null };

  // Recusa de uma sugestão de revisão feita na resposta anterior: não insistir por 14 dias.
  if (input.lastAssistant && /\brevis/i.test(input.lastAssistant) && /\b(agora n[aã]o|n[aã]o quero|depois|n[aã]o precisa|deixa pra (depois|l[aá]))\b/i.test(input.message)) {
    const declined = topics.filter((t) => input.lastAssistant!.toLowerCase().includes(t.title.toLowerCase()));
    if (declined.length) await db.kallyLearningTopic.updateMany({ where: { id: { in: declined.map((t) => t.id) } }, data: { declinedAt: new Date() } });
  }

  if (progress) {
    const due = topics.filter((t) => t.nextReviewAt && t.nextReviewAt <= new Date()).slice(0, 3);
    return {
      guide: `PROGRESSO DE ESTUDO DELA (dados reais do registro; não invente outros números). O app mostra estes dados num cartão logo abaixo da sua resposta, então não repita a lista inteira: comente o que se destaca (o que ela já domina, onde tropeça) e ${due.length ? `sugira começar a revisão por ${due.map((t) => t.title).join(", ")}` : "o próximo passo"}.\n${topics.slice(0, 12).map((t) => `- ${describe(t)}`).join("\n")}`,
      block: progressBlock(topics.slice(0, 12)),
    };
  }

  const near = related(topics, input.message, input.theme);
  const lines = near.map((t) => `- ${describe(t)}`);
  // Sugestão de revisão: outro assunto vencido, não sugerido nos últimos 3 dias e não recusado nos últimos 14.
  const now = Date.now();
  const review = topics.find((t) => !near.includes(t) && t.nextReviewAt && t.nextReviewAt.getTime() <= now && (!t.suggestedAt || now - t.suggestedAt.getTime() > 3 * DAY) && (!t.declinedAt || now - t.declinedAt.getTime() > 14 * DAY));
  if (review) await db.kallyLearningTopic.update({ where: { id: review.id }, data: { suggestedAt: new Date() } });
  if (!lines.length && !review) return { guide: null, block: null };
  return {
    guide: [
      "HISTÓRICO DE ESTUDO DELA (dados reais; use só se ajudar esta resposta, sem anunciar que você \"lembra\"):",
      ...lines,
      lines.length ? "Ajuste a explicação a isso: o que ela já domina pode ser citado como base; onde ela errou ou teve dúvida merece um exemplo a mais." : "",
      review ? `Se a resposta terminar num ponto natural para isso, sugira em UMA frase revisar ${review.title} (${review.mastery}); se não couber, não sugira.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    block: null,
  };
}

/** Bloco ```progresso que o app desenha (barra e lista), montado com os dados do banco, não pelo modelo. */
export function progressBlock(topics: Awaited<ReturnType<typeof listLearning>>) {
  const label: Record<string, string> = { dominado: "dominado", dificuldade: "com dificuldade", estudando: "estudando" };
  const lines = topics.map((t) => `- [${t.mastery === "dominado" ? "x" : " "}] ${t.title} | ${label[t.mastery] ?? t.mastery} | ${t.quizzes ? `${t.correct} de ${t.questions} certas` : `explicado ${t.explanations}×`}`);
  return `\`\`\`progresso\ntitulo: Seu progresso de estudo\n${lines.join("\n")}\n\`\`\``;
}
