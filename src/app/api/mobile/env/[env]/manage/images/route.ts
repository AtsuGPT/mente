import { saveImageUpload } from "@/lib/uploads";
import { envAccess, error, json, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Imagem para o editor; exige poder publicar no ambiente. */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context, "publish");
  if (access instanceof Response) return access;
  const saved = await saveImageUpload(request);
  return saved.ok ? json({ src: saved.src, mime: saved.mime }) : error(saved.error, saved.status);
}

export { preflight as OPTIONS } from "../../../../_lib/http";
