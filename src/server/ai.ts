import "server-only";

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
 */

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiOptions = { temperature?: number; maxTokens?: number; timeoutMs?: number };

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
  const { provider, baseUrl, model, apiKey } = config();
  if (!baseUrl) throw new AiError("A IA não está configurada no servidor (AI_BASE_URL).", 503);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body =
    provider === "ollama"
      ? { model, stream, messages, options: { temperature: options.temperature, num_predict: options.maxTokens } }
      : { model, stream, messages, temperature: options.temperature, max_tokens: options.maxTokens };
  const url = provider === "ollama" ? `${baseUrl}/api/chat` : `${baseUrl}/v1/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(options.timeoutMs ?? 120_000) });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new AiError(timedOut ? "A IA demorou demais para responder. Tente novamente." : "Não consegui conectar ao provedor de IA do servidor.", timedOut ? 504 : 503);
  }
  if (!response.ok) {
    // O corpo pode trazer detalhes do provedor: fica só no log do servidor.
    console.error("AI provider error:", response.status, (await response.text().catch(() => "")).slice(0, 300));
    throw new AiError("O provedor de IA não conseguiu responder. Confira o modelo configurado.", 502);
  }
  return { response, provider };
}

/** Resposta completa, de uma vez. */
export async function completeChat(messages: AiMessage[], options: AiOptions = {}): Promise<string> {
  const { response, provider } = await request(messages, options, false);
  const data = (await response.json()) as { message?: { content?: string }; choices?: { message?: { content?: string } }[] };
  const text = provider === "ollama" ? data.message?.content : data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AiError("A IA retornou uma resposta vazia.", 502);
  return text.trim();
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
  const { response, provider } = await request(messages, options, true);
  return readStream(response, provider);
}

async function* readStream(response: Response, provider: "ollama" | "openai"): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new AiError("A IA não enviou resposta.", 502);
  const decoder = new TextDecoder();
  let buffer = "";

  // Ollama manda uma linha JSON por pedaço; a API OpenAI manda "data: {...}" (SSE).
  const parse = (line: string): string | null => {
    const raw = provider === "ollama" ? line : line.startsWith("data: ") ? line.slice(6) : "";
    if (!raw.trim() || raw.trim() === "[DONE]") return null;
    const event = JSON.parse(raw) as { error?: string; message?: { content?: string }; choices?: { delta?: { content?: string } }[] };
    if (event.error) throw new AiError("A resposta da IA foi interrompida.", 502);
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
