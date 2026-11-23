import "server-only";
import { codingLimitUsd, dailyLimitUsd, overBudget } from "./spend";

/**
 * Modelo remoto da Kally: um servidor vLLM (API compatível com OpenAI) numa GPU alugada.
 * Só o backend fala com ele; endereço, chave e estado nunca vão para o app.
 *
 *   KALLY_REMOTE_ENABLED          "1" liga o modelo remoto (desligado por padrão: nada muda sem ele).
 *   KALLY_VLLM_BASE_URL           endereço do vLLM, ex.: http://IP:PORTA (com ou sem /v1).
 *   KALLY_VLLM_API_KEY            a chave passada ao vLLM com --api-key, se houver.
 *   KALLY_REMOTE_MODEL            o id servido (o --served-model-name ou o nome do modelo no vLLM).
 *   KALLY_REMOTE_TIMEOUT_MS       teto da resposta inteira (padrão 240 s).
 *   KALLY_REMOTE_FIRST_TOKEN_MS   sem 1º texto nesse tempo, cai para o modelo local (padrão 25 s).
 *   KALLY_REMOTE_MAX_CONCURRENCY  respostas remotas ao mesmo tempo (padrão 2); acima disso, local.
 *   KALLY_REMOTE_NO_THINK         "1": desliga o raciocínio de modelos Qwen3 híbridos (enable_thinking: false).
 *
 * O modelo local continua sendo o do pipeline (KALLY_EXECUTOR_MODEL); não há outra variável para ele.
 */

export type RemoteState = "desligado" | "disponivel" | "inicializando" | "indisponivel" | "erro";

export type RemoteHealth = {
  state: RemoteState;
  model: string | null;
  /** janela de contexto informada pelo vLLM (max_model_len) */
  maxModelLen: number | null;
  latencyMs: number | null;
  checkedAt: number;
  /** motivo, para o log e o painel do administrador (nunca vai para quem conversa) */
  detail: string | null;
};

export function remoteConfig() {
  const raw = (process.env.KALLY_VLLM_BASE_URL || "").trim().replace(/\/+$/, "").replace(/\/v1$/, "");
  const number = (v: string | undefined, fallback: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  return {
    enabled: process.env.KALLY_REMOTE_ENABLED === "1" 
    && !!raw 
    && !!process.env.KALLY_REMOTE_MODEL,
    baseUrl: raw,
    apiKey: process.env.KALLY_VLLM_API_KEY || "",
    model: process.env.KALLY_REMOTE_MODEL || "",
    timeoutMs: number(process.env.KALLY_REMOTE_TIMEOUT_MS, 240_000),
    firstTokenMs: number(process.env.KALLY_REMOTE_FIRST_TOKEN_MS, 25_000),
    maxConcurrent: Math.floor(number(process.env.KALLY_REMOTE_MAX_CONCURRENCY, 2)),
    /** KALLY_REMOTE_NO_THINK="1": pede enable_thinking: false (modelos Qwen3 híbridos) */
    noThink: process.env.KALLY_REMOTE_NO_THINK === "1",
    /**
     * KALLY_REMOTE_HOSTED="1": API paga por uso (Vercel AI Gateway, OpenRouter...) no lugar do vLLM da GPU alugada. Está
     * sempre ligada: a lista de modelos dela pode não trazer o configurado (ou vir paginada) e não conta contra.
     */
    hosted: process.env.KALLY_REMOTE_HOSTED === "1",
    /**
     * Como pedir mais ou menos raciocínio. "qwen" (padrão): enable_thinking pelo chat_template_kwargs do vLLM.
     * "effort": reasoning.effort, para modelos que sempre raciocinam (GPT-OSS e outros nas APIs); o pedido sem raciocínio
     * usa o nível baixo (KALLY_REMOTE_EFFORT_LOW) e o com raciocínio, o alto (KALLY_REMOTE_EFFORT_HIGH).
     */
    reasoning: (process.env.KALLY_REMOTE_REASONING === "effort" ? "effort" : "qwen") as "qwen" | "effort" | "toggle",
    effortLow: process.env.KALLY_REMOTE_EFFORT_LOW || "low",
    effortHigh: process.env.KALLY_REMOTE_EFFORT_HIGH || "high",
  };
}

export function remoteHeaders(apiKey = remoteConfig().apiKey): Record<string, string> {
  return { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };
}

/**
 * Kally 1.5 pela API (13/11/2026): o modelo de conversa "local" (o 8B do Ollama) passa a ser um modelo pequeno pago por
 * uso (KALLY_LIGHT_MODEL, ex.: openai/gpt-oss-20b), na mesma conta da Kally 32 (endereço e chave dela, se
 * KALLY_LIGHT_BASE_URL/KALLY_LIGHT_API_KEY não forem dados). O Qwen do PC fica como último recurso: fora do ar, com
 * falha recente ou com o teto de gasto do dia atingido (spend.ts), a resposta volta para o Ollama.
 */
export function lightConfig() {
  const main = remoteConfig();
  const raw = (process.env.KALLY_LIGHT_BASE_URL || "").trim().replace(/\/+$/, "").replace(/\/v1$/, "") || main.baseUrl;
  const apiKey = process.env.KALLY_LIGHT_API_KEY || main.apiKey;
  const model = process.env.KALLY_LIGHT_MODEL || "";
  return {
    enabled: !!model && !!raw && !!apiKey && process.env.KALLY_LIGHT_ENABLED !== "0",
    baseUrl: raw,
    apiKey,
    model,
    timeoutMs: main.timeoutMs,
    noThink: true,
    reasoning: "effort" as const,
    effortLow: process.env.KALLY_LIGHT_EFFORT_LOW || "low",
    effortHigh: process.env.KALLY_LIGHT_EFFORT_HIGH || "medium",
  };
}

/**
 * Kally Coding: um modelo só para criar artefatos e responder pedidos de programação (DeepSeek pelo OpenRouter).
 * O resto da conversa continua no modelo principal (KALLY_REMOTE_MODEL).
 *
 *   KALLY_CODING_ENABLED       "1" liga.
 *   KALLY_CODING_MODEL         id no provedor, ex.: deepseek/deepseek-v4.1-flash-1017.
 *   KALLY_CODING_BASE_URL      endereço da API (padrão: o do modelo principal).
 *   KALLY_CODING_API_KEY       chave (padrão: a do modelo principal).
 *   KALLY_CODING_EFFORT_LOW / _HIGH   raciocínio pedido (reasoning.effort) sem e com "pensar"; padrão low / high.
 *
 * Se ele falhar ou passar do teto do dia, o pedido volta ao modelo principal (e o Coding fica de fora por 2 minutos).
 */
export function codingConfig() {
  const main = remoteConfig();
  const raw = (process.env.KALLY_CODING_BASE_URL || "").trim().replace(/\/+$/, "").replace(/\/v1$/, "") || main.baseUrl;
  const apiKey = process.env.KALLY_CODING_API_KEY || main.apiKey;
  const model = (process.env.KALLY_CODING_MODEL || "").trim();
  return {
    enabled: process.env.KALLY_CODING_ENABLED === "1" && !!raw && !!apiKey && !!model,
    baseUrl: raw,
    apiKey,
    model,
    timeoutMs: main.timeoutMs,
    noThink: true,
    /**
     * "toggle": sem "pensar", o raciocínio fica desligado (reasoning.enabled: false); com ele, reasoning.effort alto.
     * Com effort "low", o DeepSeek raciocinou 4 × 16 mil tokens num artefato difícil e não escreveu nada (15/11).
     */
    reasoning: "toggle" as const,
    effortLow: process.env.KALLY_CODING_EFFORT_LOW || "low",
    effortHigh: process.env.KALLY_CODING_EFFORT_HIGH || "high",
  };
}

/** Falha recente do Kally Coding: por 2 minutos os pedidos vão ao modelo principal. */
export function noteCodingFailure() {
  registry.__kallyCodingFailedAt = Date.now();
}

export function codingCoolingDown() {
  return Date.now() - (registry.__kallyCodingFailedAt ?? 0) < 120_000;
}

/** O Kally Coding responde agora? (ligado, sem falha nos últimos 2 minutos e dentro do teto do dia) */
export function codingServes() {
  const cfg = codingConfig();
  return cfg.enabled && !codingCoolingDown() && !overBudget(cfg.model, codingLimitUsd());
}

/** Falha recente da Kally 1.5 pela API: por 2 minutos a resposta vai direto ao Ollama, sem esperar outra falha. */
export function noteLightFailure() {
  registry.__kallyLightFailedAt = Date.now();
}
export function lightCoolingDown() {
  return !!registry.__kallyLightFailedAt && Date.now() - registry.__kallyLightFailedAt < 120_000;
}

type Registry = {
  __kallyRemoteHealth?: RemoteHealth;
  __kallyRemoteHealthPending?: Promise<RemoteHealth>;
  __kallyRemoteActive?: number;
  /** estado imposto pelo controlador da GPU (ligando a instância), com validade */
  __kallyRemoteBooting?: { until: number; detail: string };
  __kallyLightFailedAt?: number;
  __kallyCodingFailedAt?: number;
};
const registry = globalThis as typeof globalThis & Registry;

/** O controlador da GPU avisa que a instância está ligando: até lá, o estado é "inicializando". */
export function markRemoteBooting(ms: number, detail: string) {
  registry.__kallyRemoteBooting = { until: Date.now() + ms, detail };
  registry.__kallyRemoteHealth = undefined;
}
export function clearRemoteBooting() {
  registry.__kallyRemoteBooting = undefined;
  registry.__kallyRemoteHealth = undefined;
}

const OK_TTL_MS = 15_000;
const FAIL_TTL_MS = 8_000;

/**
 * Saúde do vLLM: GET /v1/models com tempo curto. Confere que o modelo configurado é o servido
 * (uma instância ligada com outro modelo, ou ainda carregando, não conta como disponível).
 * O resultado fica em cache por alguns segundos para não atrasar cada pergunta.
 */
export async function remoteHealth(force = false): Promise<RemoteHealth> {
  const cfg = remoteConfig();
  const now = Date.now();
  if (!cfg.enabled) return { state: "desligado", model: null, maxModelLen: null, latencyMs: null, checkedAt: now, detail: "KALLY_REMOTE_ENABLED, KALLY_VLLM_BASE_URL ou KALLY_REMOTE_MODEL ausente" };
  // Teto de gasto do dia atingido (spend.ts): a Kally 32 sai de cena até amanhã e os pedidos descem para a Kally 1.5.
  if (cfg.hosted && overBudget(cfg.model)) return { state: "indisponivel", model: null, maxModelLen: null, latencyMs: null, checkedAt: now, detail: `teto de gasto do dia atingido (US$ ${dailyLimitUsd()})` };
  const cached = registry.__kallyRemoteHealth;
  if (!force && cached && now - cached.checkedAt < (cached.state === "disponivel" ? OK_TTL_MS : FAIL_TTL_MS)) return cached;
  if (registry.__kallyRemoteHealthPending) return registry.__kallyRemoteHealthPending;
  registry.__kallyRemoteHealthPending = (async () => {
    const started = Date.now();
    const booting = registry.__kallyRemoteBooting && registry.__kallyRemoteBooting.until > started ? registry.__kallyRemoteBooting : null;
    let health: RemoteHealth;
    try {
      // Uma conexão reaproveitada (keep-alive) que o túnel SSH já fechou falha na hora: uma nova tentativa abre outra.
      const check = () => fetch(`${cfg.baseUrl}/v1/models`, { headers: remoteHeaders(), signal: AbortSignal.timeout(4_000) });
      const r = await check().catch(async (first) => {
        if (first instanceof Error && first.name === "TimeoutError") throw first;
        await new Promise((resolve) => setTimeout(resolve, 300));
        return check();
      });
      if (r.status === 401 || r.status === 403) {
        health = { state: "erro", model: null, maxModelLen: null, latencyMs: Date.now() - started, checkedAt: Date.now(), detail: `vLLM recusou a chave (HTTP ${r.status})` };
      } else if (!r.ok) {
        health = { state: booting ? "inicializando" : "indisponivel", model: null, maxModelLen: null, latencyMs: Date.now() - started, checkedAt: Date.now(), detail: `vLLM respondeu HTTP ${r.status}` };
      } else {
        const data = (await r.json()) as { data?: { id?: string; max_model_len?: number; context_window?: number; context_length?: number }[] };
        const listed = (data.data ?? []).find((m) => m.id === cfg.model);
        const served = listed ?? (cfg.hosted ? { id: cfg.model } : undefined);
        const window = listed ? listed.max_model_len ?? listed.context_window ?? listed.context_length ?? null : null;
        health = served
          ? { state: "disponivel", model: cfg.model, maxModelLen: typeof window === "number" && window > 0 ? window : null, latencyMs: Date.now() - started, checkedAt: Date.now(), detail: null }
          : { state: "erro", model: null, maxModelLen: null, latencyMs: Date.now() - started, checkedAt: Date.now(), detail: `o vLLM serve ${(data.data ?? []).map((m) => m.id).join(", ") || "nenhum modelo"}, não ${cfg.model}` };
        if (served) registry.__kallyRemoteBooting = undefined;
      }
    } catch (cause) {
      const timeout = cause instanceof Error && cause.name === "TimeoutError";
      health = { state: booting ? "inicializando" : "indisponivel", model: null, maxModelLen: null, latencyMs: null, checkedAt: Date.now(), detail: booting ? booting.detail : timeout ? "vLLM não respondeu em 4 s" : "sem conexão com o vLLM" };
    }
    registry.__kallyRemoteHealth = health;
    return health;
  })().finally(() => {
    registry.__kallyRemoteHealthPending = undefined;
  });
  return registry.__kallyRemoteHealthPending;
}

/** Uma falha numa resposta torna a saúde desconhecida: a próxima pergunta confere de novo. */
export function invalidateRemoteHealth() {
  registry.__kallyRemoteHealth = undefined;
}

/**
 * Vaga para uma resposta remota. Sem vaga (já há KALLY_REMOTE_MAX_CONCURRENCY em andamento),
 * devolve null e a Kally responde com o modelo local em vez de enfileirar.
 */
export function acquireRemoteSlot(): { release: () => void } | null {
  const { maxConcurrent } = remoteConfig();
  const active = registry.__kallyRemoteActive ?? 0;
  if (active >= maxConcurrent) return null;
  registry.__kallyRemoteActive = active + 1;
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      registry.__kallyRemoteActive = Math.max(0, (registry.__kallyRemoteActive ?? 1) - 1);
    },
  };
}

/** Estimativa conservadora de tokens (português no tokenizador do Qwen: ~3,2 caracteres por token). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.2);
