import { detectImage } from "@/lib/uploads";
import { setEnvironmentImage } from "@/server/environments";
import { envAccess, error, json, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 700 * 1024;

/** Foto do ambiente (no original, a mesma foto de perfil do site). */
export async function PUT(request: Request, context: EnvContext) {
  const access = await envAccess(context, "manageSettings");
  if (access instanceof Response) return access;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("Não consegui ler a imagem.", 400);
  }
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return error("Escolha uma imagem para enviar.", 400);
  if (file.size > MAX_BYTES) return error("A imagem deve ter no máximo 700 KB.", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImage(bytes);
  if (!detected) return error("Envie uma imagem JPG, PNG ou WebP válida.", 415);
  await setEnvironmentImage(access.environment.id, `data:${detected.mime};base64,${bytes.toString("base64")}`);
  return json({ ok: true });
}

export async function DELETE(_request: Request, context: EnvContext) {
  const access = await envAccess(context, "manageSettings");
  if (access instanceof Response) return access;
  await setEnvironmentImage(access.environment.id, null);
  return json({ ok: true });
}

export { preflight as OPTIONS } from "../../../../_lib/http";
