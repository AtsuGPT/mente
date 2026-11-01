import { getSession } from "@/lib/auth/session";
import { AUDIO_TYPES, MAX_AUDIO_BYTES, transcribeWithWhisper } from "@/server/ai/whisper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OLLAMA_TIMEOUT_MS = 2 * 60 * 1000;

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await getSession())) return jsonError("Entre como administrador para transcrever áudio.", 401);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_AUDIO_BYTES + 64 * 1024) return jsonError("O áudio deve ter no máximo 25 MB.", 413);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Não consegui ler o arquivo de áudio.", 400);
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return jsonError("Grave ou selecione um áudio primeiro.", 400);
  if (audio.size > MAX_AUDIO_BYTES) return jsonError("O áudio deve ter no máximo 25 MB.", 413);
  const audioType = audio.type.split(";")[0].trim().toLowerCase();
  if (!AUDIO_TYPES.has(audioType)) return jsonError("Este formato de áudio não é compatível com a gravação.", 415);

  const transcription = await transcribeWithWhisper(
    audio,
    audio.name || `recording.${audio.type === "audio/mp4" ? "mp4" : "webm"}`,
  );
  if (!transcription.ok) return jsonError(transcription.error, transcription.status);
  const transcript = transcription.text.slice(0, 30_000);

  const ollamaUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.2:latest";
  try {
    const ollamaResponse = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: "system",
            content: [
              "Você revisa transcrições de áudio ditadas pelo autor de um arquivo pessoal de pensamentos.",
              "Reorganize a fala como texto escrito em português brasileiro: corrija pontuação, concordância e erros óbvios de reconhecimento; agrupe ideias em parágrafos claros. Adicione ou adapte o texto sem alterar ideias.",
              "Preserve a voz, o tom, a primeira pessoa e todas as ideias do autor. Remova apenas hesitações e repetições acidentais quando isso não alterar o sentido.",
              "Não tire conclusões que não foram ditos. Reorganize apenas o que for necessário para a clareza do texto. Sintetize quando possível.",
              "Retorne somente o texto revisado em Markdown simples.",
            ].join(" "),
          },
          { role: "user", content: `Transcrição bruta:\n\n${transcript}` },
        ],
        options: { temperature: 0.4, num_predict: 1800 },
      }),
    });
    if (!ollamaResponse.ok) {
      console.error("Ollama transcript cleanup failed:", ollamaResponse.status);
      return jsonError("O Ollama não conseguiu organizar a transcrição. Confira o modelo configurado.", 502);
    }
    const result = await ollamaResponse.json() as { message?: { content?: unknown } };
    const text = result.message?.content;
    if (typeof text !== "string" || !text.trim()) return jsonError("O Ollama retornou uma transcrição vazia.", 502);
    return Response.json({ text: text.trim() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Ollama transcript cleanup error:", error);
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const invalidResponse = error instanceof SyntaxError;
    return jsonError(
      timedOut
        ? "O Ollama demorou demais para organizar o texto."
        : invalidResponse
          ? "O Ollama respondeu em um formato inesperado."
          : "Não consegui conectar ao Ollama.",
      timedOut ? 504 : invalidResponse ? 502 : 503,
    );
  }
}