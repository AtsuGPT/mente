import { getSession } from "@/lib/auth/session";
import { AiError, completeChat } from "@/server/ai";
import { MAX_AUDIO_BYTES, transcribeAudio } from "@/server/whisper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AI_TIMEOUT_MS = 2 * 60 * 1000;

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

  const transcription = await transcribeAudio(formData.get("audio"));
  if ("error" in transcription) return jsonError(transcription.error, transcription.status);
  const transcript = transcription.text;

  try {
    const text = await completeChat(
      [
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
      { temperature: 0.4, maxTokens: 1800, timeoutMs: AI_TIMEOUT_MS },
    );
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Transcript cleanup error:", error instanceof Error ? error.message : error);
    if (error instanceof AiError) return jsonError(error.message, error.status);
    return jsonError("A IA respondeu em um formato inesperado.", 502);
  }
}
