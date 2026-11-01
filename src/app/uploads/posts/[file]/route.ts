import { readFile } from "node:fs/promises";
import path from "node:path";
import { POST_IMAGE_NAME, postImagesDirectory } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function notFound() {
  return new Response("Imagem não encontrada.", { status: 404, headers: { "Cache-Control": "no-store" } });
}

/** Serve as imagens enviadas pelo editor, lidas do disco a cada requisição. */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  // Só nomes gerados pelo upload: impede ../ e qualquer arquivo fora da pasta.
  const match = POST_IMAGE_NAME.exec(file);
  if (!match) return notFound();

  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(postImagesDirectory(), file));
  } catch {
    return notFound();
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": CONTENT_TYPES[match[1]],
      "Content-Length": String(bytes.length),
      // O nome é um uuid novo a cada upload e nunca é reutilizado.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
