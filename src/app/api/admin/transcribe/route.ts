import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const WHISPER_TIMEOUT_MS = 6 * 60 * 1000;
const OLLAMA_TIMEOUT_MS = 2 * 60 * 1000;
const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/x-m4a",
]);

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

  const whisperUrl = process.env.WHISPER_URL || "http://127.0.0.1:8001/transcribe";
  const whisperForm = new FormData();
  whisperForm.append("audio", audio, audio.name || `recording.${audio.type === "audio/mp4" ? "mp4" : "webm"}`);

  let transcript: string;
  try {
    const whisperResponse = await fetch(whisperUrl, {
      method: "POST",
      body: whisperForm,
      signal: AbortSignal.timeout(WHISPER_TIMEOUT_MS),
    });
    if (!whisperResponse.ok) {
      console.error("Whisper transcription failed:", whisperResponse.status);
      return jsonError("O Whisper não conseguiu transcrever o áudio. Confira se o serviço está ativo.", 502);
    }
    const result = await whisperResponse.json() as { text?: unknown };
    if (typeof result.text !== "string" || !result.text.trim()) {
      return jsonError("Não encontrei fala reconhecível nesse áudio.", 422);
    }
    transcript = result.text.trim().slice(0, 30_000);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return jsonError(
      timedOut ? "A transcrição demorou demais. Tente um áudio mais curto." : "Não consegui conectar ao serviço Whisper local.",
      timedOut ? 504 : 503,
    );
  }

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
              "Reorganize a fala como texto escrito em português brasileiro: corrija pontuação, concordância e erros óbvios de reconhecimento; agrupe ideias em parágrafos claros.",
              "Preserve a voz, o tom, a primeira pessoa e todas as ideias do autor. Remova apenas hesitações e repetições acidentais quando isso não alterar o sentido.",
              "Não resuma, não acrescente conteúdo, exemplos, títulos, listas ou conclusões que não foram ditos. Não explique o que fez.",
              "Retorne somente o texto revisado em Markdown simples.",
            ].join(" "),
          },
          { role: "user", content: `Transcrição bruta:\n\n${transcript}` },
        ],
        options: { temperature: 0.2, num_predict: 1800 },
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
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return jsonError(
      timedOut ? "O Ollama demorou demais para organizar o texto." : "Não consegui conectar ao Ollama.",
      timedOut ? 504 : 503,
    );
  }
}