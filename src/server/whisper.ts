import "server-only";

/** Transcrição pelo serviço Whisper local (WHISPER_URL). Usado pelo editor do site e pela Kally. */

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const WHISPER_TIMEOUT_MS = 6 * 60 * 1000;
export const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg", "audio/x-m4a", "audio/m4a", "audio/aac"]);

export type TranscribeResult = { text: string } | { error: string; status: number };

/** Confere tamanho e formato e devolve a transcrição bruta (até 30 mil caracteres). */
export async function transcribeAudio(audio: FormDataEntryValue | null): Promise<TranscribeResult> {
  if (!(audio instanceof File) || audio.size === 0) return { error: "Grave ou selecione um áudio primeiro.", status: 400 };
  if (audio.size > MAX_AUDIO_BYTES) return { error: "O áudio deve ter no máximo 25 MB.", status: 413 };
  // O app nativo pode enviar o arquivo sem tipo: aí vale a extensão da gravação.
  const declared = audio.type.split(";")[0].trim().toLowerCase();
  const byExtension = /\.(m4a|mp4|aac)$/i.test(audio.name) ? "audio/mp4" : /\.webm$/i.test(audio.name) ? "audio/webm" : /\.wav$/i.test(audio.name) ? "audio/wav" : "";
  const audioType = !declared || declared === "application/octet-stream" ? byExtension : declared;
  if (!AUDIO_TYPES.has(audioType)) return { error: "Este formato de áudio não é compatível com a gravação.", status: 415 };

  const whisperUrl = process.env.WHISPER_URL || "http://127.0.0.1:8001/transcribe";
  const form = new FormData();
  form.append("audio", audio, audio.name || `recording.${audioType === "audio/webm" ? "webm" : "m4a"}`);
  try {
    const response = await fetch(whisperUrl, { method: "POST", body: form, signal: AbortSignal.timeout(WHISPER_TIMEOUT_MS) });
    if (!response.ok) {
      console.error("Whisper transcription failed:", response.status);
      return { error: "O Whisper não conseguiu transcrever o áudio. Confira se o serviço está ativo.", status: 502 };
    }
    const result = (await response.json()) as { text?: unknown };
    if (typeof result.text !== "string" || !result.text.trim()) return { error: "Não encontrei fala reconhecível nesse áudio.", status: 422 };
    return { text: result.text.trim().slice(0, 30_000) };
  } catch (cause) {
    console.error("Whisper transcription error:", cause);
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    return timedOut
      ? { error: "A transcrição demorou demais. Tente um áudio mais curto.", status: 504 }
      : { error: "Não consegui conectar ao serviço de transcrição.", status: 503 };
  }
}
