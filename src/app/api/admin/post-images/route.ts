import { getSession } from "@/lib/auth/session";
import { saveImageUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Upload do editor do site (administrador). O app usa a rota do ambiente. */
export async function POST(request: Request) {
  if (!(await getSession())) return jsonError("Entre como administrador para enviar imagens.", 401);

  const saved = await saveImageUpload(request);
  if (!saved.ok) return jsonError(saved.error, saved.status);
  return Response.json({ src: saved.src, mime: saved.mime }, { headers: { "Cache-Control": "no-store" } });
}
