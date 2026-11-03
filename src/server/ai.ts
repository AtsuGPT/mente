import "server-only";
import { acquireModel, runtimeOptions, type Lease, type LeaseInfo } from "@/server/ai/model-manager";

/**
 * Provedor de IA da Kally, configurado só no servidor (.env). O app nunca fala com o
 * modelo diretamente: tudo passa pelas rotas do backend, que conferem as permissões.
 *
 *   AI_PROVIDER = "ollama" (padrão) — API do Ollama (/api/chat). Serve para o Ollama
 *                 local e para o Ollama Cloud (AI_BASE_URL=https://ollama.com + AI_API_KEY).
 *               | "openai" — qualquer API compatível com /v1/chat/completions
 *                 (OpenRouter, Groq, LM Studio, vLLM...).
 *   AI_BASE_URL  endereço do provedor (sem barra no fim). Padrão: OLLAMA_BASE_URL ou o Ollama local.
 *   AI_MODEL     modelo. Padrão: OLLAMA_MODEL ou llama3.2:latest.
 *   AI_API_KEY   chave, se o provedor exigir. Nunca é enviada ao app.
 *   AI_VISION_MODEL  modelo que lê imagens (Ollama). Padrão: gemma3:4b.
 *   AI_EMBED_MODEL   modelo de embeddings da memória da Kally. Padrão: qwen3-embedding:0.6b (ver EMBED_PROFILES).
 *   AI_KEEP_ALIVE    quanto tempo o Ollama mantém o modelo carregado (padrão 30m): sem isso,
 *                    cada pergunta depois de 5 minutos parada esperava o modelo recarregar.
 */

/** images: imagens em base64 (só para o modelo de visão do Ollama). */
export type AiMessage = { role: "system" | "user" | "assistant"; content: string; images?: string[] };
/** model troca o modelo só nesta chamada; json pede resposta em JSON válido. */
export type AiOptions = {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  model?: string;
  json?: boolean;
  /** Usa o mesmo num_ctx do modelo de conversa também em outro modelo (comparações justas). */
  sameContext?: boolean;
  /** Recebe as métricas que o Ollama devolve no fim da resposta (só no streaming). */
  onStats?: (stats: GenerationStats) => void;
  /** Recebe a espera na fila e as trocas de modelo feitas pelo gerenciador central. */
  onLease?: (info: LeaseInfo) => void;
};

/** Métricas do Ollama para uma resposta (tempos em segundos). */
export type GenerationStats = {
  model: string;
  loadSeconds: number;
  promptTokens: number;
  promptSeconds: number;
  outputTokens: number;
  outputSeconds: number;
  tokensPerSecond: number;
  totalSeconds: number;
  thinkingChars: number;
};

export type { LeaseInfo };

export const defaultChatModel = () => config().model;

/** Memória do modelo carregado (/api/ps): quanto está na GPU e quanto sobrou para a CPU/RAM. */
export async function ollamaMemory(model: string): Promise<{ totalGB: number; vramGB: number; cpuGB: number; context: number } | null> {
  const { provider, baseUrl } = config();
  if (provider !== "ollama") return null;
  try {
    const data = (await fetch(`${baseUrl}/api/ps`, { signal: AbortSignal.timeout(5_000) }).then((r) => r.json())) as {
      models?: { name: string; model: string; size: number; size_vram: number; context_length?: number }[];
    };
    const m = data.models?.find((x) => x.name === model || x.model === model);
    if (!m) return null;
    const gb = (n: number) => Math.round((n / 1e9) * 100) / 100;
    return { totalGB: gb(m.size), vramGB: gb(m.size_vram), cpuGB: gb(m.size - m.size_vram), context: m.context_length ?? 0 };
  } catch {
    return null;
  }
}

export class AiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function config() {
  const provider = process.env.AI_PROVIDER === "openai" ? "openai" : "ollama";
  const fallbackUrl = provider === "ollama" ? process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434" : "";
  const baseUrl = (process.env.AI_BASE_URL || fallbackUrl).replace(/\/+$/, "");
  const model = process.env.AI_MODEL || process.env.OLLAMA_MODEL || "llama3.2:latest";
  const apiKey = process.env.AI_API_KEY || "";
  return { provider, baseUrl, model, apiKey } as const;
}

async function request(messages: AiMessage[], options: AiOptions, stream: boolean) {
  const { provider, baseUrl, apiKey } = config();
  const model = options.model || config().model;
  if (!baseUrl) throw new AiError("A IA não está configurada no servidor (AI_BASE_URL).", 503);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  // Mesmo contexto da Kally do site (OLLAMA_NUM_CTX): com valores diferentes o Ollama
  // recarrega o modelo a cada troca entre as duas. Só para o modelo de conversa.
  const numCtx = model === config().model || options.sameContext ? Number(process.env.OLLAMA_NUM_CTX) || 8_192 : undefined;

  const body =
    provider === "ollama"
      ? {
          model,
          stream,
          messages,
          keep_alive: process.env.AI_KEEP_ALIVE || "30m",
          ...(options.json ? { format: "json" } : {}),
          options: {
            temperature: options.temperature,
            num_predict: options.maxTokens,
            ...(numCtx ? { num_ctx: numCtx } : {}),
            ...runtimeOptions(model),
          },
        }
      : {
          model,
          stream,
          messages: messages.map(({ role, content }) => ({ role, content })),
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          ...(options.json ? { response_format: { type: "json_object" } } : {}),
        };
  const url = provider === "ollama" ? `${baseUrl}/api/chat` : `${baseUrl}/v1/chat/completions`;
  const timeoutMs = options.timeoutMs ?? 120_000;

  // Um modelo de texto por vez (gerenciador central); a vez volta quando a resposta termina.
  let lease: Lease | null = null;
  if (provider === "ollama") {
    try {
      lease = await acquireModel(baseUrl, model, { numCtx, maxMs: timeoutMs + 5_000 });
    } catch (cause) {
      throw new AiError(cause instanceof Error ? cause.message : "A IA está ocupada. Tente de novo em instantes.", 503);
    }
    if (lease) options.onLease?.(lease.info);
  }

  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (cause) {
    lease?.release();
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new AiError(timedOut ? "A IA demorou demais para responder. Tente novamente." : "Não consegui conectar ao provedor de IA do servidor.", timedOut ? 504 : 503);
  }
  if (!response.ok) {
    lease?.release();
    // O corpo pode trazer detalhes do provedor: fica só no log do servidor.
    console.error("AI provider error:", response.status, (await response.text().catch(() => "")).slice(0, 300));
    throw new AiError("O provedor de IA não conseguiu responder. Confira o modelo configurado.", 502);
  }
  return { response, provider, lease };
}

/** Resposta completa, de uma vez. */
export async function completeChat(messages: AiMessage[], options: AiOptions = {}): Promise<string> {
  const { response, provider, lease } = await request(messages, options, false);
  try {
    const data = (await response.json()) as { message?: { content?: string }; choices?: { message?: { content?: string } }[] };
    const text = provider === "ollama" ? data.message?.content : data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new AiError("A IA retornou uma resposta vazia.", 502);
    return text.trim();
  } finally {
    lease?.release();
  }
}

/** Resposta em pedaços de texto, à medida que o modelo gera. */
export async function* streamChat(messages: AiMessage[], options: AiOptions = {}): AsyncGenerator<string> {
  yield* await openChatStream(messages, options);
}

/**
 * Conecta ao provedor já (falhas de conexão saem aqui, antes de começar a responder)
 * e devolve os pedaços de texto para ler depois.
 */
export async function openChatStream(messages: AiMessage[], options: AiOptions = {}): Promise<AsyncGenerator<string>> {
  const { response, provider, lease } = await request(messages, options, true);
  return readStream(response, provider, options.model || config().model, options.onStats, lease);
}

async function* readStream(response: Response, provider: "ollama" | "openai", model: string, onStats?: (stats: GenerationStats) => void, lease?: Lease | null): AsyncGenerator<string> {
  try {
    yield* readEvents(response, provider, model, onStats);
  } finally {
    lease?.release();
  }
}

async function* readEvents(response: Response, provider: "ollama" | "openai", model: string, onStats?: (stats: GenerationStats) => void): AsyncGenerator<string> {
  let thinkingChars = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new AiError("A IA não enviou resposta.", 502);
  const decoder = new TextDecoder();
  let buffer = "";

  // Ollama manda uma linha JSON por pedaço; a API OpenAI manda "data: {...}" (SSE).
  const parse = (line: string): string | null => {
    const raw = provider === "ollama" ? line : line.startsWith("data: ") ? line.slice(6) : "";
    if (!raw.trim() || raw.trim() === "[DONE]") return null;
    const event = JSON.parse(raw) as {
      error?: string;
      done?: boolean;
      message?: { content?: string; thinking?: string };
      choices?: { delta?: { content?: string } }[];
      load_duration?: number;
      prompt_eval_count?: number;
      prompt_eval_duration?: number;
      eval_count?: number;
      eval_duration?: number;
      total_duration?: number;
    };
    if (event.error) throw new AiError("A resposta da IA foi interrompida.", 502);
    // Modelos que "pensam" (ex.: qwen3) mandam o raciocínio à parte: não vai para a resposta.
    if (event.message?.thinking) thinkingChars += event.message.thinking.length;
    if (provider === "ollama" && event.done && onStats) {
      const s = (ns?: number) => Math.round(((ns ?? 0) / 1e9) * 100) / 100;
      onStats({
        model,
        loadSeconds: s(event.load_duration),
        promptTokens: event.prompt_eval_count ?? 0,
        promptSeconds: s(event.prompt_eval_duration),
        outputTokens: event.eval_count ?? 0,
        outputSeconds: s(event.eval_duration),
        tokensPerSecond: event.eval_duration ? Math.round(((event.eval_count ?? 0) / (event.eval_duration / 1e9)) * 10) / 10 : 0,
        totalSeconds: s(event.total_duration),
        thinkingChars,
      });
    }
    return (provider === "ollama" ? event.message?.content : event.choices?.[0]?.delta?.content) ?? null;
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const text = parse(line.trim());
      if (text) yield text;
    }
    if (done) break;
  }
  const rest = parse(buffer.trim());
  if (rest) yield rest;
}

export const visionModel = () => process.env.AI_VISION_MODEL || "gemma3:4b";

/**
 * Vetores de significado para a memória da Kally. Sempre pelo Ollama local ou pelo
 * provedor configurado (/api/embed ou /v1/embeddings). Quem chama trata a falha e
 * volta para a busca por palavras.
 *
 * No Ollama, o modelo de embeddings roda na CPU (num_gpu 0): na placa ele disputa a VRAM
 * e o Ollama tira o modelo de texto da memória para carregá-lo (medido: o qwen3:4b inteiro
 * na placa saía a cada busca). Na CPU uma busca leva ~0,1 s. AI_EMBED_ON_GPU=1 volta à placa.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const { provider, baseUrl, apiKey } = config();
  const model = embedProfile().model;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const url = provider === "ollama" ? `${baseUrl}/api/embed` : `${baseUrl}/v1/embeddings`;
  const body =
    provider === "ollama"
      ? { model, input: texts, keep_alive: process.env.AI_KEEP_ALIVE || "30m", options: process.env.AI_EMBED_ON_GPU === "1" ? { num_ctx: 2_048 } : { num_ctx: 2_048, num_gpu: 0 } }
      : { model, input: texts };
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new AiError("O modelo de embeddings não respondeu.", 502);
  const data = (await response.json()) as { embeddings?: number[][]; data?: { embedding: number[] }[] };
  const vectors = provider === "ollama" ? data.embeddings : data.data?.map((d) => d.embedding);
  if (!vectors || vectors.length !== texts.length) throw new AiError("O modelo de embeddings respondeu em formato inesperado.", 502);
  return vectors;
}

/**
 * Perfil do modelo de embeddings: os prefixos que o modelo espera e a escala das notas
 * (cosseno), medida em português com os posts reais e os exemplos da Kally.
 *
 *   qwen3-embedding:0.6b (padrão): post certo em 1º em 14 de 15 perguntas; pergunta sem
 *     relação nenhuma fica em ~0,25 (máx. 0,30) e a resposta certa em ~0,62.
 *   nomic-embed-text: 8 de 15; pergunta sem relação ~0,60, quase igual à certa (~0,69).
 *
 * floor = nota de "sem relação"; min = a partir de onde o significado conta; span = faixa
 * que leva a nota de floor a 1; weight = peso do significado contra as palavras em comum.
 */
export type EmbedProfile = { model: string; query: string; document: string; floor: number; min: number; span: number; weight: number; conversationMin: number };
const EMBED_PROFILES: Record<string, Omit<EmbedProfile, "model">> = {
  "qwen3-embedding:0.6b": {
    query: "Instruct: Given a search query in Portuguese, retrieve relevant passages that answer the query\nQuery: ",
    document: "",
    floor: 0.3,
    min: 0.4,
    span: 0.3,
    weight: 0.7,
    conversationMin: 0.55,
  },
  "nomic-embed-text:latest": { query: "search_query: ", document: "search_document: ", floor: 0.62, min: 0.665, span: 0.13, weight: 0.55, conversationMin: 0.72 },
};

export function embedProfile(): EmbedProfile {
  const raw = process.env.AI_EMBED_MODEL || "qwen3-embedding:0.6b";
  const model = raw.includes(":") ? raw : `${raw}:latest`;
  // Modelo sem perfil medido: sem prefixos e com a escala do qwen3 (ajuste KALLY_SEMANTIC_MIN se precisar).
  const profile = EMBED_PROFILES[model] ?? { ...EMBED_PROFILES["qwen3-embedding:0.6b"], query: "", document: "" };
  const min = Number(process.env.KALLY_SEMANTIC_MIN) || profile.min;
  return { model, ...profile, min };
}

// Vetores das últimas perguntas, só em memória e por poucos minutos: a mesma mensagem é
// buscada na memória do ambiente, nos exemplos e nas bases de documentos. Nunca vai para disco.
const queryCache = new Map<string, { vector: number[]; at: number }>();
const QUERY_CACHE_MS = 3 * 60_000;

/** Vetores de perguntas (com o prefixo de busca do modelo). */
export async function embedQueries(texts: string[]): Promise<number[][]> {
  const { model, query } = embedProfile();
  const now = Date.now();
  for (const [k, v] of queryCache) if (now - v.at > QUERY_CACHE_MS) queryCache.delete(k);
  const keys = texts.map((t) => `${model}\n${t}`);
  const missing = texts.filter((_, i) => !queryCache.has(keys[i]));
  if (missing.length) {
    const vectors = await embed(missing.map((t) => query + t));
    missing.forEach((t, i) => queryCache.set(`${model}\n${t}`, { vector: vectors[i], at: now }));
  }
  return keys.map((k) => queryCache.get(k)!.vector);
}

/** Vetores de textos a indexar (com o prefixo de documento do modelo). */
export function embedDocuments(texts: string[]): Promise<number[][]> {
  const { document } = embedProfile();
  return embed(texts.map((t) => document + t));
}
