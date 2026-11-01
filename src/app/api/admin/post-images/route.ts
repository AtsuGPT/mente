import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth/session";
import { detectImage, postImagesDirectory } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await getSession())) return jsonError("Entre como administrador para enviar imagens.", 401);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMAGE_BYTES + 64 * 1024) return jsonError("A imagem deve ter no máximo 5 MB.", 413);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Não consegui ler o arquivo de imagem.", 400);
  }

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) return jsonError("Selecione uma imagem.", 400);
  if (image.size > MAX_IMAGE_BYTES) return jsonError("A imagem deve ter no máximo 5 MB.", 413);

  const bytes = Buffer.from(await image.arrayBuffer());
  const detected = detectImage(bytes);
  if (!detected) return jsonError("Envie uma imagem JPG, PNG ou WebP válida.", 415);

  const filename = `${randomUUID()}.${detected.extension}`;
  const uploadDirectory = postImagesDirectory();
  await mkdir(uploadDirectory, { recursive: true });
  // Pasta de dados (volume), não código: fica fora do rastreamento de arquivos do build.
  await writeFile(path.join(/*turbopackIgnore: true*/ uploadDirectory, filename), bytes, { flag: "wx" });

  return Response.json(
    { src: `/uploads/posts/${filename}`, mime: detected.mime },
    { headers: { "Cache-Control": "no-store" } },
  );
}