import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function detectImage(bytes: Buffer): { mime: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mime: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
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
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "posts");
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, filename), bytes, { flag: "wx" });

  return Response.json(
    { src: `/uploads/posts/${filename}`, mime: detected.mime },
    { headers: { "Cache-Control": "no-store" } },
  );
}