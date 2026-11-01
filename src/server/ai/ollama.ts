import "server-only";

/**
 * Chamadas ao Ollama usadas pela Kally (chat, criação de posts, anexos).
 * Mantém o mesmo provedor e as mesmas variáveis já usadas no projeto
 * (OLLAMA_BASE_URL e OLLAMA_MODEL).
 */

export type OllamaMessage = { role: "system" | "user" | "assistant"; content: string; images?: string[] };

/** Mantém o modelo carregado entre pedidos (sem isso, ele sai da memória após 5 min parado). */
const KEEP_ALIVE = () => process.env.AI_KEEP_ALIVE || "30m";

export function ollamaConfig() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.2:latest";
  const parsedCtx = Number(process.env.OLLAMA_NUM_CTX);
  // 8192 (não 16384): com 16k o llama3.2 passa de 4 GB e metade roda na CPU numa GPU de 4 GB.
  // O mesmo valor é usado pela Kally do app (server/ai.ts), para o Ollama não recarregar o modelo.
  const numCtx = Number.isFinite(parsedCtx) && parsedCtx >= 2048 ? Math.floor(parsedCtx) : 8_192;
  return { baseUrl, model, numCtx };
}

export class OllamaError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function connectionError(error: unknown): OllamaError {
  if (error instanceof OllamaError) return error;
  if (error instanceof Error && error.name === "TimeoutError") {
    return new OllamaError("O Ollama demorou demais para responder. Tente novamente.", 504);
  }
  return new OllamaError("Não consegui conectar ao Ollama. Verifique se ele está em execução no servidor.", 503);
}

type ChatOptions = {
  model?: string;
  numPredict?: number;
  temperature?: number;
  /** null mantém o contexto padrão do Ollama (comportamento original do chat). */
  numCtx?: number | null;
  timeoutMs?: number;
  signal?: AbortSignal;
};

function requestSignal(options: ChatOptions) {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 180_000);
  return options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
}

function modelOptions(options: ChatOptions) {
  const { numCtx } = ollamaConfig();
  return {
    ...(options.numCtx === null ? {} : { num_ctx: options.numCtx ?? numCtx }),
    ...(options.numPredict ? { num_predict: options.numPredict } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  };
}

/**
 * Streaming de uma resposta. Devolve o texto completo e o motivo de parada
 * ("length" indica que o limite de geração foi atingido antes do fim).
 */
export async function streamOllamaChat(
  messages: OllamaMessage[],
  onToken: (token: string) => void,
  options: ChatOptions = {},
): Promise<{ text: string; doneReason: string }> {
  const { baseUrl, model } = ollamaConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: requestSignal(options),
      body: JSON.stringify({ model: options.model ?? model, stream: true, messages, keep_alive: KEEP_ALIVE(), options: modelOptions(options) }),
    });
  } catch (error) {
    throw connectionError(error);
  }
  if (!response.ok || !response.body) {
    console.error("Ollama request failed:", response.status, await response.text().catch(() => ""));
    throw new OllamaError("O Ollama não conseguiu responder. Confira se o modelo configurado está instalado.", 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let doneReason = "stop";
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as { message?: { content?: string }; done?: boolean; done_reason?: string; error?: string };
    if (event.error) throw new OllamaError(event.error, 502);
    if (event.message?.content) {
      text += event.message.content;
      onToken(event.message.content);
    }
    if (event.done) doneReason = event.done_reason || "stop";
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
      if (done) break;
    }
    if (buffer.trim()) handleLine(buffer);
  } catch (error) {
    if (error instanceof OllamaError) throw error;
    throw connectionError(error);
  }
  return { text, doneReason };
}

/**
 * Gera um texto longo sem cortes prematuros: quando o modelo para por limite
 * de geração, pede a continuação exatamente do ponto em que parou.
 */
export async function streamLongOllamaChat(
  messages: OllamaMessage[],
  onToken: (token: string) => void,
  options: ChatOptions & { maxContinuations?: number; maxChars?: number } = {},
): Promise<{ text: string; continuations: number; truncated: boolean }> {
  const maxContinuations = options.maxContinuations ?? 3;
  const maxChars = options.maxChars ?? 80_000;
  let text = "";
  let continuations = 0;
  let conversation = messages;
  while (true) {
    const result = await streamOllamaChat(conversation, (token) => {
      text += token;
      onToken(token);
    }, options);
    if (result.doneReason !== "length") return { text, continuations, truncated: false };
    if (continuations >= maxContinuations || text.length >= maxChars) return { text, continuations, truncated: true };
    continuations += 1;
    conversation = [
      ...messages,
      { role: "assistant", content: text.slice(-12_000) },
      {
        role: "user",
        content: "Você atingiu o limite de geração no meio do texto. Continue exatamente do ponto em que parou, sem repetir o que já escreveu, sem recomeçar e sem comentários sobre a continuação. Mantenha o mesmo tom e a mesma estrutura, e não conclua antes de desenvolver o que falta.",
      },
    ];
  }
}

/** Resposta única em JSON, validada pelo chamador. Devolve null se o modelo não seguir o formato. */
export async function ollamaJson<T>(
  messages: OllamaMessage[],
  schema: Record<string, unknown>,
  options: ChatOptions = {},
): Promise<T | null> {
  const { baseUrl, model } = ollamaConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: requestSignal(options),
      body: JSON.stringify({
        model: options.model ?? model,
        stream: false,
        format: schema,
        messages,
        keep_alive: KEEP_ALIVE(),
        options: { ...modelOptions(options), temperature: options.temperature ?? 0.2 },
      }),
    });
  } catch (error) {
    throw connectionError(error);
  }
  if (!response.ok) {
    console.error("Ollama JSON request failed:", response.status, await response.text().catch(() => ""));
    throw new OllamaError("O Ollama não conseguiu responder. Confira se o modelo configurado está instalado.", 502);
  }
  try {
    const result = await response.json() as { message?: { content?: string } };
    const content = result.message?.content?.trim();
    if (!content) return null;
    return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
  } catch {
    return null;
  }
}

const visionCache = new Map<string, { value: boolean; checkedAt: number }>();

/** Consulta /api/show para saber se o modelo aceita imagens (capacidade "vision"). */
export async function visionModel(): Promise<string | null> {
  const { baseUrl, model } = ollamaConfig();
  const candidate = process.env.OLLAMA_VISION_MODEL || model;
  const cached = visionCache.get(candidate);
  if (cached && Date.now() - cached.checkedAt < 5 * 60_000) return cached.value ? candidate : null;
  let value = false;
  try {
    const response = await fetch(`${baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ model: candidate }),
    });
    if (response.ok) {
      const info = await response.json() as { capabilities?: unknown; details?: { families?: unknown } };
      const capabilities = Array.isArray(info.capabilities) ? info.capabilities : [];
      const families = Array.isArray(info.details?.families) ? info.details.families : [];
      value = capabilities.includes("vision") || families.includes("clip") || families.includes("mllama");
    }
  } catch {
    value = false;
  }
  visionCache.set(candidate, { value, checkedAt: Date.now() });
  return value ? candidate : null;
}
