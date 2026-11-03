import "server-only";
import { ollamaJson } from "@/server/ai/ollama";
import type { LeaseInfo } from "@/server/ai/model-manager";
import type { CompetenceId } from "./competences/types";

/**
 * Pipeline da Kally em duas etapas, com UM modelo carregado por vez (server/ai/model-manager.ts):
 *
 *   interpretador (llama3.2 3B) → só quando as regras não bastam: identifica a competência,
 *                                  a intenção, os pontos da pessoa e uma estrutura de resposta;
 *   executor (qwen3 4B)          → escreve a resposta, guiado pela interpretação.
 *
 * Na maioria das mensagens a competência já é conhecida (modo escolhido, /comando, regras de
 * detectIntent, papo casual) e o pedido vai direto ao executor, sem troca de modelo: o executor
 * fica carregado e só o interpretador entra e sai.
 *
 *   KALLY_PIPELINE           = "admin" (só o administrador da plataforma) | "on" (todos) | desligado
 *   KALLY_EXECUTOR_MODEL     = padrão qwen3:4b-instruct-2507-q4_K_M
 *   KALLY_INTERPRETER_MODEL  = padrão llama3.2:latest
 */

export type Competence = "estudo" | "post" | "analise" | "orientacao" | "conversa";
export type Interpretation = {
  competencia: Competence;
  intencao: string;
  pontos: string[];
  estrutura: string[];
  lacunas: string[];
  profundidade: "breve" | "media" | "aprofundada";
};

const COMPETENCES: Competence[] = ["estudo", "post", "analise", "orientacao", "conversa"];
const DEPTHS: Interpretation["profundidade"][] = ["breve", "media", "aprofundada"];

export type Pipeline = { executor: string; interpreter: string | null };

const EXECUTOR = () => process.env.KALLY_EXECUTOR_MODEL || "qwen3:4b-instruct-2507-q4_K_M";
const INTERPRETER = () => process.env.KALLY_INTERPRETER_MODEL || "llama3.2:latest";

export function pipelineFor(platformAdmin: boolean): Pipeline | null {
  const setting = process.env.KALLY_PIPELINE;
  if (setting !== "on" && !(setting === "admin" && platformAdmin)) return null;
  return { executor: EXECUTOR(), interpreter: INTERPRETER() };
}

/**
 * Configurações comparadas na avaliação (Etapa 6). Só valem com KALLY_EVAL=1 (servidor de
 * testes) e para o administrador: "producao" é a Kally de antes (llama3.2, prompts antigos,
 * sem competências nem bases); as outras usam competências e bases, mudando os modelos.
 */
export const EVAL_CONFIGS = ["producao", "llama", "qwen", "llama-qwen", "qwen-qwen"] as const;
export function evalPipeline(config: (typeof EVAL_CONFIGS)[number]): Pipeline | null {
  switch (config) {
    case "producao":
      return null;
    case "llama":
      return { executor: INTERPRETER(), interpreter: null };
    case "qwen":
      return { executor: EXECUTOR(), interpreter: null };
    case "llama-qwen":
      return { executor: EXECUTOR(), interpreter: INTERPRETER() };
    case "qwen-qwen":
      return { executor: EXECUTOR(), interpreter: EXECUTOR() };
  }
}

/**
 * O interpretador só entra quando nada mais define a competência: modo Automático, sem
 * comando e sem texto para revisar. Mensagem curta fica com as regras (trocar de modelo custa
 * ~14 s). Texto longo passa sempre por ele: as regras procuram palavras soltas e erram justamente
 * aí (medido: um relato com "aprender a cozinhar" e uma análise com "quero entender" caíam no
 * modo Aprender). Anexo com mensagem curta passa só se as regras não reconheceram o pedido.
 */
export function needsInterpretation(input: {
  requested: string;
  postCommand: boolean;
  hasReviewPayload: boolean;
  intentMode: string;
  message: string;
  hasAttachment: boolean;
}) {
  if (input.requested !== "auto" || input.postCommand || input.hasReviewPayload) return false;
  if (input.message.length >= 280) return true;
  return input.hasAttachment && input.intentMode === "chat";
}

const SCHEMA = {
  type: "object",
  properties: {
    competencia: { type: "string", enum: COMPETENCES },
    intencao: { type: "string" },
    pontos: { type: "array", items: { type: "string" } },
    estrutura: { type: "array", items: { type: "string" } },
    lacunas: { type: "array", items: { type: "string" } },
    profundidade: { type: "string", enum: DEPTHS },
  },
  required: ["competencia", "intencao", "pontos", "estrutura", "lacunas", "profundidade"],
};

const SYSTEM = [
  "Você é o interpretador de pedidos da Kally, assistente de escrita e estudo do Minha Mente. Outro modelo vai responder; sua tarefa é só entender e estruturar o pedido.",
  "Não responda ao pedido, não opine e não acrescente conteúdo seu.",
  "Competências:",
  "- estudo: a pessoa quer um texto de estudo ou técnico que explique um tema (conceitos, exemplos, aplicações), MESMO QUE chame o resultado de post: o conteúdo vem do conhecimento sobre o tema.",
  "- post: a pessoa expõe pensamentos, opiniões ou vivências PRÓPRIAS e quer transformá-los em um post elaborado: o conteúdo vem dela.",
  "- analise: a pessoa quer análise crítica, revisão, avaliação ou opinião fundamentada sobre um texto, ideia, argumento ou documento.",
  "- orientacao: a pessoa quer orientação ou um plano de estudo, inclusive a partir de um documento anexado.",
  "- conversa: qualquer outra coisa (desabafo, pergunta simples, papo).",
  "Campos: intencao = uma frase com o que a pessoa quer. pontos = as ideias que a PRÓPRIA pessoa apresentou, resumidas com fidelidade (lista vazia se ela não apresentou ideias). estrutura = seções sugeridas para a resposta, em ordem (lista vazia para conversa). lacunas = até 3 informações que faltam para uma boa resposta. profundidade = breve, media ou aprofundada, conforme o pedido.",
  "Escreva os campos em português. Responda só com o JSON.",
].join("\n");

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const list = (value: unknown, items: number) => (Array.isArray(value) ? value.map((v) => clip(v, 240)).filter(Boolean).slice(0, items) : []);

/** Chama o interpretador. Devolve null se ele falhar ou fugir do formato (o pedido segue sem ele). */
export async function interpret(
  model: string,
  input: { message: string; lastAssistant?: string; attachment?: { name: string; text: string } | null },
): Promise<{ result: Interpretation | null; ms: number; lease: LeaseInfo | null }> {
  const started = Date.now();
  let lease: LeaseInfo | null = null;
  const content = [
    input.lastAssistant ? `Última resposta da Kally (só contexto):\n"""${input.lastAssistant.slice(0, 600)}"""` : "",
    `Pedido da pessoa:\n"""${input.message}"""`,
    input.attachment ? `Anexo "${input.attachment.name}" (início):\n"""${input.attachment.text.slice(0, 1_200)}"""` : "",
  ].filter(Boolean).join("\n\n");
  try {
    const raw = await ollamaJson<Record<string, unknown>>(
      [{ role: "system", content: SYSTEM }, { role: "user", content }],
      SCHEMA,
      { model, temperature: 0.1, numPredict: 500, timeoutMs: 90_000, onLease: (info) => (lease = info) },
    );
    const competencia = COMPETENCES.includes(raw?.competencia as Competence) ? (raw!.competencia as Competence) : null;
    const result: Interpretation | null = raw && competencia
      ? {
          competencia,
          intencao: clip(raw.intencao, 300),
          pontos: list(raw.pontos, 8),
          estrutura: list(raw.estrutura, 7),
          lacunas: list(raw.lacunas, 3),
          profundidade: DEPTHS.includes(raw.profundidade as Interpretation["profundidade"]) ? (raw.profundidade as Interpretation["profundidade"]) : "media",
        }
      : null;
    return { result, ms: Date.now() - started, lease };
  } catch (cause) {
    console.warn("Kally interpretador:", cause instanceof Error ? cause.message : cause);
    return { result: null, ms: Date.now() - started, lease };
  }
}

// Pedidos curtos (sem interpretador) que já dizem a competência. Ficam de fora "o que você acha"
// e "faz sentido?": em papo comum elas virariam uma análise formal.
const ANALYSIS_RULE = /\banalis[ae]r?\b|\bcritique\b|\bcriticamente\b|\bavali(e|ar)\b|\bse sustenta\b|\besse argumento\b|\bplano de estudos?\b|\bcronograma de estudos?\b|\bme orient[ae]\b|\bpor onde come[çc]o\b|\bcomo (eu )?(organizo|estudo)\b/;
const STUDY_RULE = /\b(me )?expli(ca|que|car)\b|\b(material|texto|resumo|apostila|post) (de estudo|did[aá]tico|explicando)|\bcomo funciona\b|\bdiferen[çc]a entre\b/;
const STUDY_POST_RULE = /\b(explican?do|expli(ca|que)|como funciona|o que (é|são)|tutorial|passo a passo)\b/;

/**
 * Competência do pedido (competences/): da interpretação, se houve; senão do modo e das regras
 * acima. null = conversa ou aprendizagem guiada, com o prompt de sempre.
 */
export function competenceFor(input: { mode: string; interpretation: Interpretation | null; message: string; reviewKind: "textual" | "intelectual" | null }): CompetenceId | null {
  const i = input.interpretation;
  if (i) return i.competencia === "estudo" ? "estudo" : i.competencia === "post" ? "post" : i.competencia === "conversa" ? null : "analise";
  const m = input.message.toLowerCase();
  if (input.mode === "ideia") return STUDY_POST_RULE.test(m) ? "estudo" : "post";
  // Revisão textual (sugestões trecho a trecho) segue o fluxo próprio; sem texto, a Kally só pede o texto.
  if (input.mode === "revisar") return input.reviewKind === "intelectual" ? "analise" : null;
  if (ANALYSIS_RULE.test(m)) return "analise";
  if (input.mode === "aprender") return null;
  return STUDY_RULE.test(m) ? "estudo" : null;
}

/**
 * A pessoa fala dos próprios textos ("meus posts", "o que escrevi", "no ambiente"). Mais estrito
 * que o wantsMemory de detectIntent, que também aceita "analise" e "relaciona" soltos.
 */
export const refersToOwnPosts = (message: string) =>
  /\b(meus?|minhas?|nossos?) (posts?|textos?|pensamentos?|ideias|rascunhos?|projetos?)\b|o que (eu )?(escrevi|publiquei|pensei)|\bno ambiente\b|\bnos (posts|pensamentos|textos)\b/i.test(message);

/** A pessoa pediu um post publicável (e pode publicar): a resposta vem como <rascunho>. */
export function wantsDraft(competence: CompetenceId | null, message: string, canPublish: boolean) {
  if (!canPublish || !competence || competence === "analise") return false;
  return competence === "post" || /\b(post|publica\w*|postar|blog)\b/i.test(message);
}

/** Modo da Kally que atende cada competência (rótulo no app e o que a busca na memória inclui). */
export function competenceMode(i: Interpretation, can: { publish: boolean; textToReview: boolean }): "chat" | "ideia" | "revisar" | "aprender" {
  switch (i.competencia) {
    case "post":
      return can.publish ? "ideia" : "chat";
    case "analise":
      return can.textToReview ? "revisar" : "chat";
    case "orientacao":
      return "aprender";
    default:
      return "chat";
  }
}

/** Bloco para o executor: guia a resposta, sem ser tratado como fala da pessoa. */
export function interpretationGuide(i: Interpretation) {
  const parts = [
    "INTERPRETAÇÃO PRÉVIA DO PEDIDO (feita por outro modelo; use como guia e corrija se estiver errada; não é fala da pessoa):",
    `Intenção: ${i.intencao || "(não identificada)"}.`,
    i.pontos.length ? `Pontos que a própria pessoa apresentou: ${i.pontos.map((p, n) => `(${n + 1}) ${p}`).join(" ")}` : "",
    i.estrutura.length ? `Estrutura sugerida: ${i.estrutura.join(" → ")}.` : "",
    i.lacunas.length ? `O que falta saber: ${i.lacunas.join("; ")}.` : "",
    `Profundidade pedida: ${i.profundidade}.`,
  ];
  return parts.filter(Boolean).join(" ");
}
