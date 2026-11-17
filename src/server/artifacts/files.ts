import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Arquivos que a Kally gera numa conversa ("transforma isso em PDF"): o servidor gera ANTES de anunciar, guarda aqui por
 * 24 horas e a pessoa baixa pelo id (rota /kally/arquivos/[id]), só ela e só no ambiente em que pediu. O conteúdo
 * continua salvo como artefato na conversa; este arquivo é só a cópia pronta para baixar.
 */

const DIR = () => path.join(process.cwd(), "logs", "kally-arquivos");
const TTL_MS = 24 * 60 * 60 * 1000;
const ID = /^[a-f0-9]{24}$/;

type Meta = { environmentId: string; userId: string; name: string; type: string; createdAt: number };

/** Apaga o que passou de 24 h (chamado a cada arquivo novo; nada roda sozinho). */
async function sweep() {
  const files = await readdir(DIR()).catch(() => [] as string[]);
  const now = Date.now();
  await Promise.all(
    files.map(async (f) => {
      const full = path.join(DIR(), f);
      const s = await stat(full).catch(() => null);
      if (s && now - s.mtimeMs > TTL_MS) await rm(full, { force: true }).catch(() => undefined);
    }),
  );
}

export async function storeFile(input: { environmentId: string; userId: string; name: string; type: string; body: Buffer }) {
  await mkdir(DIR(), { recursive: true });
  await sweep();
  const id = randomBytes(12).toString("hex");
  const meta: Meta = { environmentId: input.environmentId, userId: input.userId, name: input.name, type: input.type, createdAt: Date.now() };
  await writeFile(path.join(DIR(), `${id}.bin`), input.body);
  await writeFile(path.join(DIR(), `${id}.json`), JSON.stringify(meta));
  return id;
}

/** O arquivo, se existir, for desta pessoa neste ambiente e tiver menos de 24 h. */
export async function readStoredFile(id: string, who: { environmentId: string; userId: string }) {
  if (!ID.test(id)) return null;
  const meta = await readFile(path.join(DIR(), `${id}.json`), "utf8").then((t) => JSON.parse(t) as Meta).catch(() => null);
  if (!meta || meta.environmentId !== who.environmentId || meta.userId !== who.userId || Date.now() - meta.createdAt > TTL_MS) return null;
  const body = await readFile(path.join(DIR(), `${id}.bin`)).catch(() => null);
  return body ? { body, name: meta.name, type: meta.type } : null;
}

/** Páginas de um PDF (contagem dos objetos /Type /Page do arquivo que o Chrome gera). */
export function pdfPages(pdf: Buffer) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
