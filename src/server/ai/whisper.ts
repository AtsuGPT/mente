import "server-only";

/**
 * Transcrição pelo serviço Whisper local (WHISPER_URL). Compartilhado entre a
 * gravação do editor (/api/admin/transcribe) e os anexos de áudio da Kally.
 */

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const WHISPER_TIMEOUT_MS = 6 * 60 * 1000;

export const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/x-m4a",
]);

/** Extensões aceitas pelo serviço Whisper (ver src/app/api/whisper/server.py). */
export const AUDIO_EXTENSIONS = new Set(["webm", "mp4", "m4a", "ogg", "wav", "mp3", "mpeg"]);

export type WhisperResult =
  | { ok: true; text: string }
  | { ok: false; error: string; status: number };

export async function transcribeWithWhisper(audio: Blob, filename: string): Promise<WhisperResult> {
  const whisperUrl = process.env.WHISPER_URL || "http://127.0.0.1:8001/transcribe";
  const whisperForm = new FormData();
  whisperForm.append("audio", audio, filename);

  try {
    const whisperResponse = await fetch(whisperUrl, {
      method: "POST",
      body: whisperForm,
      signal: AbortSignal.timeout(WHISPER_TIMEOUT_MS),
    });
    if (!whisperResponse.ok) {
      console.error("Whisper transcription failed:", whisperResponse.status);
      return { ok: false, error: "O Whisper não conseguiu transcrever o áudio. Confira se o serviço está ativo.", status: 502 };
    }
    const result = await whisperResponse.json() as { text?: unknown };
    if (typeof result.text !== "string" || !result.text.trim()) {
      return { ok: false, error: "Não encontrei fala reconhecível nesse áudio.", status: 422 };
    }
    return { ok: true, text: result.text.trim() };
  } catch (error) {
    console.error("Whisper transcription error:", error);
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      error: timedOut ? "A transcrição demorou demais. Tente um áudio mais curto." : "Não consegui conectar ao serviço Whisper local.",
      status: timedOut ? 504 : 503,
    };
  }
}
