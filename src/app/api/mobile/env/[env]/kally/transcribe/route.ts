import { MAX_AUDIO_BYTES, transcribeAudio } from "@/server/whisper";
import { envAccess, error, json, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Áudio de uma ideia → transcrição bruta, para a pessoa ver e editar antes de enviar
 * à Kally. Só para quem pode publicar no ambiente (o rascunho vira um post).
 */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context, "publish");
  if (access instanceof Response) return access;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES + 64 * 1024) return error("O áudio deve ter no máximo 25 MB.", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Não consegui ler o arquivo de áudio.", 400);
  }
  const result = await transcribeAudio(form.get("audio"));
  return "error" in result ? error(result.error, result.status) : json({ text: result.text });
}

export { preflight as OPTIONS } from "../../../../_lib/http";
