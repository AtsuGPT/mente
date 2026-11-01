import { saveImageBytes } from "@/lib/uploads";
import { searchImages } from "@/server/web-search";
import { envAccess, error, json, readJson, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sugestões de imagens livres (Wikimedia Commons) para um pensamento: ?q=tema */
export async function GET(request: Request, context: EnvContext) {
  const access = await envAccess(context, "publish");
  if (access instanceof Response) return access;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (!q.trim()) return error("Diga o tema da imagem.", 400);
  return json({ images: await searchImages(q, 8) });
}

/**
 * Importa UMA imagem aprovada pela pessoa para os arquivos do site, e devolve o
 * Markdown com crédito para o rascunho. Só aceita endereços do Wikimedia (sem buscar
 * URLs arbitrárias a partir do servidor).
 */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context, "publish");
  if (access instanceof Response) return access;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const url = typeof body.url === "string" ? body.url : "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return error("Endereço de imagem inválido.", 400);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "upload.wikimedia.org") return error("Só imagens do Wikimedia Commons podem ser importadas.", 400);

  const response = await fetch(parsed, { headers: { "User-Agent": "MinhaMente-Kally/1.0 (https://minhamente.space)" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!response?.ok) return error("Não consegui baixar a imagem.", 502);
  const saved = await saveImageBytes(Buffer.from(await response.arrayBuffer()));
  if (!saved.ok) return error(saved.error, saved.status);

  const alt = (typeof body.title === "string" ? body.title : "Imagem").replace(/[[\]]/g, "").slice(0, 120);
  const credit = [typeof body.author === "string" ? body.author : "", typeof body.license === "string" ? body.license : ""].filter(Boolean).join(", ");
  const page = typeof body.page === "string" && body.page.startsWith("https://commons.wikimedia.org/") ? body.page : "";
  const markdown = `![${alt}](${saved.src})\n*Imagem: ${credit || "Wikimedia Commons"}${page ? ` — [fonte](${page})` : ""}*`;
  return json({ src: saved.src, markdown }, { status: 201 });
}

export { preflight as OPTIONS } from "../../../../_lib/http";
