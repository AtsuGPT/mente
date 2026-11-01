import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Imagens dos pensamentos ficam fora de public/: em produção o Next só serve os
 * arquivos de public/ que existiam ao iniciar, e uploads nascem com o site no ar.
 * A rota /uploads/posts/[file] lê desta pasta a cada requisição.
 */

/** Nome gerado pelo servidor no upload: uuid + extensão detectada pelos bytes. */
export const POST_IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Tipo real da imagem pela assinatura dos bytes (o tipo enviado pelo navegador pode ser falso). */
export function detectImage(bytes: Buffer): { mime: string; extension: string } | null {
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

/** Pasta das imagens. UPLOADS_DIR permite apontar para um volume; o padrão é ./uploads. */
export function postImagesDirectory(): string {
  return path.join(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"), "posts");
}

export type SavedImage = { ok: true; src: string; mime: string } | { ok: false; error: string; status: number };

/** Lê o campo "image" do FormData, valida (até 5 MB, JPG/PNG/WebP pelos bytes) e grava com nome uuid. */
export async function saveImageUpload(request: Request): Promise<SavedImage> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMAGE_BYTES + 64 * 1024) return { ok: false, error: "A imagem deve ter no máximo 5 MB.", status: 413 };

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { ok: false, error: "Não consegui ler o arquivo de imagem.", status: 400 };
  }

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) return { ok: false, error: "Selecione uma imagem.", status: 400 };
  if (image.size > MAX_IMAGE_BYTES) return { ok: false, error: "A imagem deve ter no máximo 5 MB.", status: 413 };

  return saveImageBytes(Buffer.from(await image.arrayBuffer()));
}

/** Valida os bytes (JPG/PNG/WebP, até 5 MB) e grava com nome uuid. Usado também pela Kally ao importar imagens aprovadas. */
export async function saveImageBytes(bytes: Buffer): Promise<SavedImage> {
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "A imagem deve ter no máximo 5 MB.", status: 413 };
  const detected = detectImage(bytes);
  if (!detected) return { ok: false, error: "Envie uma imagem JPG, PNG ou WebP válida.", status: 415 };

  const filename = `${randomUUID()}.${detected.extension}`;
  const uploadDirectory = postImagesDirectory();
  await mkdir(uploadDirectory, { recursive: true });
  // Pasta de dados (volume), não código: fica fora do rastreamento de arquivos do build.
  await writeFile(path.join(/*turbopackIgnore: true*/ uploadDirectory, filename), bytes, { flag: "wx" });
  return { ok: true, src: `/uploads/posts/${filename}`, mime: detected.mime };
}
