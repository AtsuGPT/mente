import { fetch as streamingFetch } from "expo/fetch";
import { authHeaders } from "./api";
import { API_URL } from "./config";

/**
 * Lê as rotas de IA já existentes no backend (/api/thoughts/[slug]/insight e /api/chat),
 * que respondem em Server-Sent Events: "data: {...}\n\n". Não altera a IA: só consome.
 */

export type StreamEvent = { text?: string; error?: string; done?: boolean; status?: string; conversationId?: string; mode?: string; sources?: { title: string; slug: string; href?: string }[] };

export async function streamEvents(path: string, body: unknown, onEvent: (event: StreamEvent) => void, signal?: AbortSignal) {
  let response;
  try {
    response = await streamingFetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders() },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new Error(`Não consegui conectar ao servidor em ${API_URL}.`);
  }

  if (!response.ok) {
    let message = "Não foi possível gerar a resposta.";
    try {
      message = ((await response.json()) as { error?: string }).error || message;
    } catch {
      // resposta sem JSON
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error("O servidor não enviou a resposta em tempo real.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handle = (frame: string) => {
    const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    if (!data) return;
    const event = JSON.parse(data) as StreamEvent;
    if (event.error) throw new Error(event.error);
    onEvent(event);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) handle(frame);
    if (done) break;
  }
  if (buffer.trim()) handle(buffer);
}
