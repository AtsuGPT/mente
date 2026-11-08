import "server-only";
import type { AttachmentInfo, AttachmentStatus } from "@/lib/kally/types";

/**
 * Extração de texto dos documentos da Kally (PDF, DOCX, TXT, Markdown, CSV), usada pela
 * base de documentos (server/kally/documents.ts). Cada parte sai com o rótulo de onde está.
 */

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

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


/**
 * Texto de um documento (PDF por página, DOCX, TXT, MD, CSV), com o rótulo de onde cada parte
 * está. null = formato não suportado. Usado na base de documentos da Kally.
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
