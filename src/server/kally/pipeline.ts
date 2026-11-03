import "server-only";
import { ollamaJson } from "@/server/ai/ollama";
import type { LeaseInfo } from "@/server/ai/model-manager";

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

export function pipelineFor(platformAdmin: boolean): { executor: string; interpreter: string } | null {
  const setting = process.env.KALLY_PIPELINE;
  if (setting !== "on" && !(setting === "admin" && platformAdmin)) return null;
  return {
    executor: process.env.KALLY_EXECUTOR_MODEL || "qwen3:4b-instruct-2507-q4_K_M",
    interpreter: process.env.KALLY_INTERPRETER_MODEL || "llama3.2:latest",
  };
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

/** Modo da Kally que atende cada competência (as instruções próprias de cada uma vêm depois). */
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
