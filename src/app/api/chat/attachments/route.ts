import { getAccessRole } from "@/lib/auth/session";
import { MAX_AUDIO_BYTES } from "@/server/ai/whisper";
import { processAttachment, removeAttachment } from "@/server/kally/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_UPLOADS_PER_WINDOW = 30;
const uploadsByIp = new Map<string, { count: number; resetAt: number }>();

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function allowedUpload(ip: string) {
  const now = Date.now();
  for (const [key, entry] of uploadsByIp) if (entry.resetAt <= now) uploadsByIp.delete(key);
  const entry = uploadsByIp.get(ip);
  if (!entry) {
    uploadsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_UPLOADS_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}

/** Recebe UM arquivo por requisição, para que o chat mostre o progresso de cada anexo. */
export async function POST(request: Request) {
  const role = await getAccessRole();
  if (role !== "ADMIN" && role !== "INTIMO") {
    return jsonError("Anexos estão disponíveis para quem entrou com usuário e senha.", 403);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_AUDIO_BYTES + 64 * 1024) return jsonError("O arquivo é grande demais (máximo de 25 MB para áudio e 15 MB para documentos).", 413);

  if (role !== "ADMIN") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    if (!allowedUpload(ip)) return jsonError("Limite de anexos atingido. Tente novamente em alguns minutos.", 429);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Não consegui receber o arquivo.", 400);
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return jsonError("Selecione um arquivo.", 400);

  try {
    const result = await processAttachment(file, role, { allowAudio: role === "ADMIN" });
    if (!result.ok) return jsonError(result.error, result.status);
    return Response.json({ attachment: result.attachment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Attachment processing failed:", error);
    return jsonError("Falha ao processar o arquivo. Ele não foi interpretado.", 500);
  }
}

export async function DELETE(request: Request) {
  const role = await getAccessRole();
  if (role !== "ADMIN" && role !== "INTIMO") return jsonError("Sem permissão.", 403);
  const id = new URL(request.url).searchParams.get("id");
  if (id) removeAttachment(id, role);
  return new Response(null, { status: 204 });
}
