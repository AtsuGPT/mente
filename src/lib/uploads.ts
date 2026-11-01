import "server-only";
import path from "node:path";

/**
 * Imagens dos pensamentos ficam fora de public/: em produção o Next só serve os
 * arquivos de public/ que existiam ao iniciar, e uploads nascem com o site no ar.
 * A rota /uploads/posts/[file] lê desta pasta a cada requisição.
 */

/** Nome gerado pelo servidor no upload: uuid + extensão detectada pelos bytes. */
export const POST_IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

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
