import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { embedDocuments, embedProfile, embedQueries } from "@/server/ai";
import { extensionOf, extractDocument, MAX_DOCUMENT_BYTES, UNSUPPORTED_HINTS } from "./attachments";
import { queryTerms, scoreChunk, splitIntoChunks } from "./chunks";

/**
 * Bases de conhecimento da Kally (RAG): extração → trechos → embeddings → busca por significado.
 *
 *   institucional: documentos de referência, com origem identificável, consultados por todos;
 *                  só o administrador da plataforma adiciona ou remove.
 *   pessoal:       PDFs, artigos e notas de uma pessoa, cumulativos; só ela consulta e remove.
 *
 * A separação é feita na consulta ao banco (userId), nunca depois. Nada disso é treino: os
 * trechos entram no contexto na hora da pergunta, marcados com a origem.
 */

export type DocumentScope = "institucional" | "pessoal";
export type DocumentHit = { documentId: string; scope: DocumentScope; title: string; origin: string; label: string; text: string; score: number };

const MAX_CHARS = 400_000; // ~200 páginas
const MAX_PERSONAL_DOCUMENTS = 60;
const CHUNK_CHARS = 1_100;
const EMBED_BATCH = 8;
// Indexação interrompida (o servidor reiniciou no meio): passa a erro depois disso.
const STALE_PROCESSING_MS = 30 * 60_000;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const toBytes = (vector: number[]) => Buffer.from(new Float32Array(vector).buffer);
// Cópia: o Buffer do banco pode não estar alinhado em 4 bytes.
const toVector = (bytes: Uint8Array) => new Float32Array(new Uint8Array(bytes).buffer);

const shared = globalThis as typeof globalThis & {
  __kallyDocQueue?: Promise<unknown>;
  __kallyDocVectors?: Map<string, { version: string; chunks: { label: string; text: string; vector: Float32Array }[] }>;
};

/** Indexação na CPU, um documento por vez (o modelo de embeddings não disputa com ele mesmo). */
function enqueue(job: () => Promise<void>) {
  const run = (shared.__kallyDocQueue ?? Promise.resolve()).then(job, job);
  shared.__kallyDocQueue = run.catch(() => undefined);
}

export async function listDocuments(userId: string, options: { institutional: boolean }) {
  await db.kallyDocument.updateMany({
    where: { status: "processando", updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    data: { status: "erro", detail: "A indexação foi interrompida. Envie o arquivo de novo." },
  });
  return db.kallyDocument.findMany({
    where: { OR: [{ scope: "pessoal", userId }, ...(options.institutional ? [{ scope: "institucional" }] : [])] },
    select: { id: true, scope: true, title: true, origin: true, kind: true, chars: true, status: true, detail: true, createdAt: true, updatedAt: true, _count: { select: { chunks: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export type AddResult = { ok: true; id: string; status: string; reused: boolean; detail: string } | { ok: false; error: string; status: number };

/**
 * Adiciona um documento à base. Mesmo conteúdo já indexado pela mesma pessoa (ou na base
 * institucional): devolve o existente, sem reindexar. Mesmo nome com conteúdo diferente: é uma
 * nova versão, e os trechos antigos são trocados. A indexação roda em segundo plano.
 */
export async function addDocument(input: { scope: DocumentScope; userId: string; file: File; title?: string; origin?: string }): Promise<AddResult> {
  const name = (input.file.name || "documento").slice(0, 160);
  const extension = extensionOf(name);
  if (input.file.size === 0) return { ok: false, error: "O arquivo está vazio.", status: 400 };
  if (input.file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "Documentos devem ter no máximo 15 MB.", status: 413 };
  const extraction = await extractDocument(new Uint8Array(await input.file.arrayBuffer()), extension);
  if (!extraction) return { ok: false, error: UNSUPPORTED_HINTS[extension] ?? "Use PDF, DOCX, TXT, MD ou CSV.", status: 415 };
  if (!extraction.sections.length) return { ok: false, error: extraction.detail, status: 422 };

  let remaining = MAX_CHARS;
  const sections = extraction.sections
    .map((s) => {
      const text = s.text.slice(0, Math.max(remaining, 0));
      remaining -= text.length;
      return { label: s.label, text };
    })
    .filter((s) => s.text.trim());
  const fullText = sections.map((s) => s.text).join("\n\n");
  const hash = sha256(fullText);
  const owner = input.scope === "pessoal" ? input.userId : null;
  const model = embedProfile().model;
  const origin = (input.origin?.trim() || name).slice(0, 300);
  const title = (input.title?.trim() || name.replace(/\.[a-z0-9]{1,8}$/i, "")).slice(0, 160);
  const detail = `${extraction.detail}${remaining < 0 ? ` Só os primeiros ${MAX_CHARS.toLocaleString("pt-BR")} caracteres entraram na base.` : ""}`;

  const same = await db.kallyDocument.findFirst({ where: { scope: input.scope, userId: owner, hash, embedModel: model, status: { not: "erro" } }, select: { id: true, status: true } });
  if (same) return { ok: true, id: same.id, status: same.status, reused: true, detail: "Este conteúdo já está na base." };

  const previous = await db.kallyDocument.findFirst({ where: { scope: input.scope, userId: owner, origin }, select: { id: true } });
  if (!previous && input.scope === "pessoal" && (await db.kallyDocument.count({ where: { scope: "pessoal", userId: owner } })) >= MAX_PERSONAL_DOCUMENTS) {
    return { ok: false, error: `A sua base já tem ${MAX_PERSONAL_DOCUMENTS} documentos. Remova algum para adicionar outro.`, status: 409 };
  }
  const data = { title, origin, kind: extraction.kind, hash, chars: fullText.length, embedModel: model, status: "processando", detail };
  const document = previous
    ? await db.kallyDocument.update({ where: { id: previous.id }, data })
    : await db.kallyDocument.create({ data: { ...data, scope: input.scope, userId: owner } });
  enqueue(() => indexDocument(document.id, sections));
  return { ok: true, id: document.id, status: "processando", reused: false, detail };
}

async function indexDocument(id: string, sections: { label: string; text: string }[]) {
  const started = Date.now();
  try {
    const chunks = splitIntoChunks(sections, CHUNK_CHARS);
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) vectors.push(...(await embedDocuments(chunks.slice(i, i + EMBED_BATCH).map((c) => c.text))));
    await db.$transaction([
      db.kallyDocumentChunk.deleteMany({ where: { documentId: id } }),
      db.kallyDocumentChunk.createMany({ data: chunks.map((c, position) => ({ documentId: id, position, label: c.label, text: c.text, vector: toBytes(vectors[position]) })) }),
      db.kallyDocument.update({ where: { id }, data: { status: "pronto" } }),
    ]);
    console.info(`Kally documentos: ${chunks.length} trechos indexados em ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  } catch (cause) {
    console.error("Kally documentos: indexação falhou:", cause instanceof Error ? cause.message : cause);
    await db.kallyDocument.update({ where: { id }, data: { status: "erro", detail: "Não consegui indexar este documento. Tente de novo." } }).catch(() => undefined);
  }
}

/** Remove um documento: o pessoal só pela dona; o institucional só pelo administrador. */
export async function deleteDocument(id: string, userId: string, platformAdmin: boolean) {
  const document = await db.kallyDocument.findUnique({ where: { id }, select: { scope: true, userId: true } });
  if (!document) return false;
  const allowed = document.scope === "pessoal" ? document.userId === userId : platformAdmin;
  if (!allowed) return false;
  await db.kallyDocument.delete({ where: { id } });
  shared.__kallyDocVectors?.delete(id);
  return true;
}

/**
 * Trechos mais relevantes das bases da pessoa: a pessoal dela e a institucional. Os vetores
 * ficam em memória por versão do documento (updatedAt); documento atualizado é relido do banco.
 * No máximo dois trechos por documento, para a resposta não depender de uma fonte só.
 */
export async function searchDocuments(input: { userId: string; query: string; limit?: number; institutional?: boolean; personal?: boolean }): Promise<{ hits: DocumentHit[]; ms: number }> {
  const started = Date.now();
  const profile = embedProfile();
  const docs = await db.kallyDocument.findMany({
    where: {
      status: "pronto",
      embedModel: profile.model,
      OR: [...(input.personal !== false ? [{ scope: "pessoal", userId: input.userId }] : []), ...(input.institutional !== false ? [{ scope: "institucional" }] : [])],
    },
    select: { id: true, scope: true, title: true, origin: true, updatedAt: true },
  });
  if (!docs.length) return { hits: [], ms: Date.now() - started };

  shared.__kallyDocVectors ??= new Map();
  const cache = shared.__kallyDocVectors;
  const outdated = docs.filter((d) => cache.get(d.id)?.version !== d.updatedAt.toISOString());
  if (outdated.length) {
    const rows = await db.kallyDocumentChunk.findMany({ where: { documentId: { in: outdated.map((d) => d.id) } }, select: { documentId: true, label: true, text: true, vector: true }, orderBy: { position: "asc" } });
    for (const d of outdated) cache.set(d.id, { version: d.updatedAt.toISOString(), chunks: [] });
    for (const row of rows) cache.get(row.documentId)!.chunks.push({ label: row.label, text: row.text, vector: toVector(row.vector) });
  }

  const [query] = await embedQueries([input.query.slice(0, 2_000)]);
  const terms = queryTerms(input.query);
  // Abaixo disso o trecho não trata do assunto (com o qwen3-embedding, sem relação fica em ~0,25–0,30).
  const minimum = profile.min + 0.05;
  const scored: DocumentHit[] = [];
  for (const d of docs) {
    for (const chunk of cache.get(d.id)?.chunks ?? []) {
      if (chunk.vector.length !== query.length) continue;
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < query.length; i++) {
        dot += query[i] * chunk.vector[i];
        na += query[i] * query[i];
        nb += chunk.vector[i] * chunk.vector[i];
      }
      const semantic = na && nb ? dot / Math.sqrt(na * nb) : 0;
      if (semantic < minimum) continue;
      // Palavras em comum só desempatam: o significado é que decide.
      const score = semantic + Math.min(scoreChunk(chunk.text, terms) / 10, 1) * 0.04;
      scored.push({ documentId: d.id, scope: d.scope as DocumentScope, title: d.title, origin: d.origin, label: chunk.label, text: chunk.text, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const perDocument = new Map<string, number>();
  const hits: DocumentHit[] = [];
  for (const hit of scored) {
    const used = perDocument.get(hit.documentId) ?? 0;
    if (used >= 2) continue;
    perDocument.set(hit.documentId, used + 1);
    hits.push(hit);
    if (hits.length >= (input.limit ?? 4)) break;
  }
  return { hits, ms: Date.now() - started };
}
