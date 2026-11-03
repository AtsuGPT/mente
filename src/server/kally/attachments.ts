import "server-only";
import { randomUUID } from "node:crypto";
import { detectImageMime } from "@/lib/image-mime";
import type { AttachmentInfo, AttachmentStatus } from "@/lib/kally/types";
import { streamOllamaChat, visionModel } from "@/server/ai/ollama";
import { AUDIO_EXTENSIONS, MAX_AUDIO_BYTES, transcribeWithWhisper } from "@/server/ai/whisper";
import { queryTerms, selectRelevantChunks, splitIntoChunks, type Chunk } from "./chunks";

/**
 * Processamento de anexos da Kally: extrai o conteúdo real de cada arquivo,
 * guarda em memória por tempo limitado e devolve apenas os trechos
 * relevantes para cada pergunta. Nada é gravado no banco.
 */

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_REQUEST = 10;
const MAX_STORED_CHARS = 600_000;
const TTL_MS = 3 * 60 * 60 * 1000;
const MAX_ENTRIES = 60;

type StoredAttachment = AttachmentInfo & {
  owner: string;
  createdAt: number;
  chunks: Chunk[];
};

const globalStore = globalThis as unknown as { kallyAttachments?: Map<string, StoredAttachment> };
const store = globalStore.kallyAttachments ?? new Map<string, StoredAttachment>();
globalStore.kallyAttachments = store;

function prune() {
  const now = Date.now();
  for (const [id, entry] of store) if (now - entry.createdAt > TTL_MS) store.delete(id);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (!oldest) break;
    store.delete(oldest);
  }
}

function extensionOf(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] ?? "";
}

const UNSUPPORTED_HINTS: Record<string, string> = {
  doc: "O formato .doc (Word antigo) não é suportado. Salve como .docx ou PDF.",
  xls: "Planilhas Excel não são suportadas. Exporte como CSV.",
  xlsx: "Planilhas Excel não são suportadas. Exporte como CSV.",
  ppt: "Apresentações não são suportadas. Exporte como PDF.",
  pptx: "Apresentações não são suportadas. Exporte como PDF.",
  odt: "O formato .odt não é suportado. Salve como .docx ou PDF.",
  rtf: "O formato .rtf não é suportado. Salve como .docx, PDF ou TXT.",
  gif: "Imagens GIF não são suportadas. Use PNG, JPG ou WEBP.",
  heic: "Imagens HEIC não são suportadas. Converta para JPG ou PNG.",
};

type Extraction = {
  kind: AttachmentInfo["kind"];
  status: AttachmentStatus;
  detail: string;
  sections: { label: string; text: string }[];
  pages?: number;
};

/** Decodifica texto em UTF-8 (ou Windows-1252) e rejeita conteúdo binário. */
export function decodeText(bytes: Uint8Array): { text: string } | { error: string } {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return { error: "O arquivo está vazio." };
  const sample = text.slice(0, 20_000);
  const control = sample.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)?.length ?? 0;
  if (control > sample.length * 0.01) return { error: "O conteúdo parece binário ou corrompido; não é texto legível." };
  return { text };
}

/** Parser CSV simples (RFC 4180), com detecção de separador vírgula, ponto e vírgula ou tabulação. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split("\n", 1)[0] ?? "";
  const delimiter = [",", ";", "\t"]
    .map((candidate) => ({ candidate, count: firstLine.split(candidate).length }))
    .sort((a, b) => b.count - a.count)[0].candidate;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\"" && text[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") quoted = false;
      else field += char;
    } else if (char === "\"" && !field) quoted = true;
    else if (char === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvExtraction(text: string): Extraction {
  const rows = parseCsv(text);
  if (rows.length === 0) return { kind: "csv", status: "unreadable", detail: "O CSV está vazio.", sections: [] };
  const header = rows[0].map((name, index) => name || `coluna ${index + 1}`);
  const body = rows.slice(1);
  const sections: { label: string; text: string }[] = [
    { label: "cabeçalho", text: `Colunas (${header.length}): ${header.join(" | ")}\nTotal de linhas de dados: ${body.length}` },
  ];
  for (let start = 0; start < body.length; start += 30) {
    const slice = body.slice(start, start + 30);
    sections.push({
      label: `linhas ${start + 2}–${start + slice.length + 1}`,
      text: slice
        .map((values, offset) => `Linha ${start + offset + 2}: ${header.map((name, column) => `${name}: ${values[column] ?? ""}`).join(" | ")}`)
        .join("\n\n"),
    });
  }
  return {
    kind: "csv",
    status: "ready",
    detail: `CSV com ${body.length} linha(s) de dados e ${header.length} coluna(s): ${header.slice(0, 8).join(", ")}${header.length > 8 ? "…" : ""}.`,
    sections,
  };
}

async function pdfExtraction(bytes: Uint8Array): Promise<Extraction> {
  if (new TextDecoder().decode(bytes.subarray(0, 1024)).indexOf("%PDF-") === -1) {
    return { kind: "pdf", status: "unreadable", detail: "O arquivo não é um PDF válido (assinatura %PDF ausente).", sections: [] };
  }
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const sections = text
      .map((pageText, index) => ({ label: `p. ${index + 1}`, text: pageText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() }))
      .filter((section) => section.text.length > 0);
    const chars = sections.reduce((sum, section) => sum + section.text.length, 0);
    if (chars < 20) {
      return {
        kind: "pdf",
        status: "unreadable",
        detail: `PDF com ${totalPages} página(s), mas sem texto extraível — provavelmente digitalizado (imagem). OCR de PDF não está disponível.`,
        sections: [],
        pages: totalPages,
      };
    }
    const emptyPages = totalPages - sections.length;
    return {
      kind: "pdf",
      status: emptyPages > totalPages / 2 ? "partial" : "ready",
      detail: `PDF com ${totalPages} página(s); texto extraído de ${sections.length}.${emptyPages ? ` ${emptyPages} página(s) sem texto (imagem ou em branco) não foram lidas.` : ""}`,
      sections,
      pages: totalPages,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const encrypted = /password|encrypt/i.test(message);
    return {
      kind: "pdf",
      status: "unreadable",
      detail: encrypted ? "O PDF está protegido por senha e não pôde ser lido." : "O PDF está corrompido ou em uma estrutura que não consegui ler.",
      sections: [],
    };
  }
}

async function docxExtraction(bytes: Uint8Array): Promise<Extraction> {
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    return { kind: "docx", status: "unreadable", detail: "O arquivo não é um DOCX válido.", sections: [] };
  }
  try {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = result.value.replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return { kind: "docx", status: "unreadable", detail: "O DOCX não contém texto.", sections: [] };
    return { kind: "docx", status: "ready", detail: "Documento Word: texto extraído (formatação, imagens e tabelas complexas não são preservadas).", sections: [{ label: "texto", text }] };
  } catch {
    return { kind: "docx", status: "unreadable", detail: "O DOCX está corrompido ou não pôde ser aberto.", sections: [] };
  }
}

async function imageExtraction(bytes: Uint8Array): Promise<Extraction> {
  const mime = detectImageMime(Buffer.from(bytes));
  if (!mime) return { kind: "imagem", status: "unreadable", detail: "A imagem está corrompida ou não é PNG, JPG ou WEBP.", sections: [] };
  const model = await visionModel();
  if (!model) {
    return {
      kind: "imagem",
      status: "received",
      detail: "Imagem recebida, mas NÃO interpretada: o modelo do Ollama configurado não tem suporte a visão. Configure OLLAMA_VISION_MODEL (por exemplo, llama3.2-vision) para que a Kally leia imagens.",
      sections: [],
    };
  }
  try {
    const { text } = await streamOllamaChat(
      [
        {
          role: "system",
          content: "Você descreve imagens para que outra etapa as analise. Responda em português brasileiro. Primeiro transcreva fielmente todo texto visível (se houver). Depois descreva o conteúdo relevante: elementos, gráficos, dados, diagramas. Não invente o que não está visível; diga quando algo estiver ilegível.",
        },
        { role: "user", content: "Transcreva e descreva esta imagem.", images: [Buffer.from(bytes).toString("base64")] },
      ],
      () => {},
      { model, numPredict: 1_200, temperature: 0.1, timeoutMs: 4 * 60_000, numCtx: 8_192 },
    );
    if (!text.trim()) return { kind: "imagem", status: "unreadable", detail: "O modelo de visão não conseguiu descrever a imagem.", sections: [] };
    return {
      kind: "imagem",
      status: "ready",
      detail: `Imagem interpretada pelo modelo de visão ${model} (descrição e texto visível; pode conter imprecisões).`,
      sections: [{ label: "descrição", text: text.trim() }],
    };
  } catch {
    return { kind: "imagem", status: "received", detail: "Imagem recebida, mas o modelo de visão não respondeu; ela NÃO foi interpretada.", sections: [] };
  }
}

async function audioExtraction(file: File, extension: string): Promise<Extraction> {
  if (file.size > MAX_AUDIO_BYTES) return { kind: "audio", status: "unsupported", detail: "O áudio deve ter no máximo 25 MB.", sections: [] };
  const result = await transcribeWithWhisper(file, file.name || `audio.${extension}`);
  if (!result.ok) return { kind: "audio", status: result.status === 422 ? "unreadable" : "received", detail: `Áudio recebido, mas não transcrito: ${result.error}`, sections: [] };
  return { kind: "audio", status: "ready", detail: "Áudio transcrito pelo Whisper local (transcrição literal, pode conter erros de reconhecimento).", sections: [{ label: "transcrição", text: result.text }] };
}

export type ProcessResult = { ok: true; attachment: AttachmentInfo } | { ok: false; error: string; status: number };

export async function processAttachment(file: File, owner: string, options: { allowAudio: boolean }): Promise<ProcessResult> {
  const name = (file.name || "arquivo").slice(0, 160);
  const extension = extensionOf(name);
  if (file.size === 0) return finish(name, owner, { kind: "texto", status: "unreadable", detail: "O arquivo está vazio.", sections: [] });

  let extraction: Extraction;
  if (AUDIO_EXTENSIONS.has(extension) || file.type.startsWith("audio/")) {
    if (!options.allowAudio) return { ok: false, error: "A transcrição de áudio está disponível apenas para o administrador.", status: 403 };
    extraction = await audioExtraction(file, extension || "webm");
  } else if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Imagens devem ter no máximo 8 MB.", status: 413 };
    extraction = await imageExtraction(new Uint8Array(await file.arrayBuffer()));
  } else {
    if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "Documentos devem ter no máximo 15 MB.", status: 413 };
    const document = await extractDocument(new Uint8Array(await file.arrayBuffer()), extension);
    if (!document) {
      return finish(name, owner, {
        kind: "texto",
        status: "unsupported",
        detail: UNSUPPORTED_HINTS[extension] ?? `O formato ${extension ? `.${extension}` : "deste arquivo"} não é suportado. Use PDF, TXT, MD, DOCX, CSV, PNG, JPG, WEBP ou áudio.`,
        sections: [],
      });
    }
    extraction = document;
  }
  return finish(name, owner, extraction);
}

/**
 * Texto de um documento (PDF por página, DOCX, TXT, MD, CSV), com o rótulo de onde cada parte
 * está. null = formato não suportado. Usado nos anexos e na base de documentos da Kally.
 */
export async function extractDocument(bytes: Uint8Array, extension: string): Promise<Extraction | null> {
  if (extension === "pdf") return pdfExtraction(bytes);
  if (extension === "docx") return docxExtraction(bytes);
  if (!["txt", "md", "markdown", "csv", "tsv"].includes(extension)) return null;
  const decoded = decodeText(bytes);
  const kind = extension === "csv" || extension === "tsv" ? "csv" : extension === "txt" ? "texto" : "markdown";
  if ("error" in decoded) return { kind, status: "unreadable", detail: decoded.error, sections: [] };
  if (kind === "csv") return csvExtraction(decoded.text);
  return { kind, status: "ready", detail: kind === "markdown" ? "Markdown lido integralmente." : "Texto lido integralmente.", sections: [{ label: "texto", text: decoded.text }] };
}

export { extensionOf, UNSUPPORTED_HINTS };

function finish(name: string, owner: string, extraction: Extraction): ProcessResult {
  prune();
  let remaining = MAX_STORED_CHARS;
  let truncated = false;
  const sections: { label: string; text: string }[] = [];
  for (const section of extraction.sections) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const text = section.text.slice(0, remaining);
    if (text.length < section.text.length) truncated = true;
    remaining -= text.length;
    sections.push({ label: section.label, text });
  }
  const chunks = splitIntoChunks(sections);
  const chars = sections.reduce((sum, section) => sum + section.text.length, 0);
  const attachment: StoredAttachment = {
    id: randomUUID(),
    name,
    kind: extraction.kind,
    status: truncated && extraction.status === "ready" ? "partial" : extraction.status,
    detail: truncated ? `${extraction.detail} O arquivo é muito grande: apenas os primeiros ${MAX_STORED_CHARS.toLocaleString("pt-BR")} caracteres foram considerados.` : extraction.detail,
    chars,
    ...(extraction.pages ? { pages: extraction.pages } : {}),
    owner,
    createdAt: Date.now(),
    chunks,
  };
  store.set(attachment.id, attachment);
  const { owner: _owner, createdAt: _createdAt, chunks: _chunks, ...info } = attachment;
  return { ok: true, attachment: info };
}

export function removeAttachment(id: string, owner: string) {
  const entry = store.get(id);
  if (entry && entry.owner === owner) store.delete(id);
}

export type AttachmentContext = {
  context: string;
  used: { id: string; ref: string; name: string; status: AttachmentStatus; detail: string }[];
  missing: string[];
};

const KIND_LABEL: Record<AttachmentInfo["kind"], string> = {
  pdf: "PDF",
  texto: "TXT",
  markdown: "Markdown",
  docx: "DOCX",
  csv: "CSV",
  imagem: "Imagem",
  audio: "Áudio",
};

/**
 * Monta o contexto dos anexos para o modelo: cabeçalho de cada documento
 * (com o estado real do processamento) e os trechos mais relevantes para
 * a consulta, divididos de forma justa dentro do orçamento.
 */
export function buildAttachmentContext(ids: string[], owner: string, query: string, budget: number): AttachmentContext {
  prune();
  const entries: StoredAttachment[] = [];
  const missing: string[] = [];
  for (const id of [...new Set(ids)].slice(0, MAX_ATTACHMENTS_PER_REQUEST)) {
    const entry = store.get(id);
    if (entry && entry.owner === owner) entries.push(entry);
    else missing.push(id);
  }
  if (!entries.length) return { context: "", used: [], missing };

  const terms = queryTerms(query);
  const withContent = entries.filter((entry) => entry.chunks.length > 0);
  const allotments = new Map<string, number>();
  let remaining = budget;
  const bySize = [...withContent].sort((a, b) => a.chars - b.chars);
  bySize.forEach((entry, index) => {
    const share = Math.floor(remaining / (bySize.length - index));
    const allot = Math.min(entry.chars, share);
    allotments.set(entry.id, allot);
    remaining -= allot;
  });

  const blocks: string[] = [];
  const used: AttachmentContext["used"] = [];
  entries.forEach((entry, index) => {
    const ref = `A${index + 1}`;
    used.push({ id: entry.id, ref, name: entry.name, status: entry.status, detail: entry.detail });
    const header = `[${ref}] "${entry.name}" — ${KIND_LABEL[entry.kind]}${entry.pages ? `, ${entry.pages} página(s)` : ""}. Estado: ${entry.status === "ready" ? "interpretado" : entry.status === "partial" ? "interpretado parcialmente" : "NÃO interpretado"}. ${entry.detail}`;
    if (!entry.chunks.length) {
      blocks.push(`${header}\n(Sem conteúdo disponível. Não presuma nada sobre este arquivo além do nome.)`);
      return;
    }
    const { chunks, omitted } = selectRelevantChunks(entry.chunks, terms, allotments.get(entry.id) ?? 2_000);
    const body = chunks.map((chunk) => `(${ref}, ${chunk.label}) ${chunk.text}`).join("\n\n");
    blocks.push(`${header}${omitted ? `\n[Documento longo: ${chunks.length} de ${entry.chunks.length} trechos selecionados por relevância; ${omitted} trecho(s) omitidos.]` : ""}\n${body}`);
  });
  return { context: blocks.join("\n\n---\n\n"), used, missing };
}
