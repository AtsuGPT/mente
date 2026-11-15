import { kindFrom, type ArtifactFormat, type ArtifactKind } from "./kinds";

/**
 * O formato padronizado em que a Kally entrega um artefato, dentro da própria resposta (Markdown):
 *
 *   ```artefato
 *   titulo: Circuito RC
 *   tipo: simulador
 *   descricao: Carga e descarga de um capacitor, com R e C ajustáveis.
 *   categoria: Física
 *   ref: (id do artefato salvo, quando é uma nova versão dele)
 *   ---
 *   <!doctype html>
 *   ...a página inteira...
 *   ```
 *
 * E, para mudar um artefato que já existe sem reescrevê-lo, blocos de troca:
 *
 *   ```artefato-edicao
 *   nota: curva em verde e controle de tensão
 *   <<<<<<< BUSCAR
 *   (trecho exato do código atual)
 *   =======
 *   (trecho novo)
 *   >>>>>>> FIM
 *   ```
 *
 * Este arquivo só lê e escreve esse texto (sem banco, sem rede): o servidor usa para validar e o app tem a mesma
 * leitura em mobile/src/lib/artifact.ts.
 */

export type ArtifactBlock = {
  title: string;
  kind: ArtifactKind | null;
  description: string;
  category: string;
  ref: string | null;
  format: ArtifactFormat;
  source: string;
  /** Texto exato do bloco na resposta (da cerca de abertura à de fechamento). */
  raw: string;
  /** A cerca de fechamento chegou (no streaming, um bloco pela metade não está fechado). */
  closed: boolean;
};

export type EditBlock = { note: string; edits: { search: string; replace: string }[]; raw: string; closed: boolean };

const OPEN = /^(`{3,}|~{3,})[ \t]*(artefato(?:-edicao|-edição)?)\b[^\n]*$/gim;

type Fence = { lang: string; body: string; raw: string; closed: boolean; start: number; end: number };

function fences(text: string): Fence[] {
  const out: Fence[] = [];
  OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN.exec(text))) {
    const fence = m[1];
    const start = m.index;
    const bodyStart = start + m[0].length + 1;
    const close = new RegExp(`^${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`, "m");
    const rest = text.slice(bodyStart);
    const c = close.exec(rest);
    const closed = !!c;
    const bodyEnd = c ? bodyStart + c.index : text.length;
    const end = c ? bodyStart + c.index + c[0].length : text.length;
    out.push({ lang: m[2].toLowerCase().replace("ç", "c").replace("ã", "a"), body: text.slice(Math.min(bodyStart, text.length), bodyEnd).replace(/\n$/, ""), raw: text.slice(start, end), closed, start, end });
    OPEN.lastIndex = end;
  }
  return out;
}

const KEY = /^\s*(titulo|título|title|tipo|type|descricao|descrição|description|categoria|category|ref|id|nota|formato)\s*:\s*(.*)$/i;

function fold(key: string) {
  return key.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function parseArtifactBody(body: string) {
  const lines = body.split("\n");
  const meta: Record<string, string> = {};
  let i = 0;
  // Cabeçalho: linhas "chave: valor" até "---" (ou até a primeira linha que não é cabeçalho).
  for (; i < Math.min(lines.length, 16); i++) {
    const line = lines[i];
    if (/^\s*-{3,}\s*$/.test(line)) {
      i += 1;
      break;
    }
    const k = line.match(KEY);
    if (!k) {
      if (!line.trim() && Object.keys(meta).length === 0) continue;
      break;
    }
    meta[fold(k[1])] = k[2].trim();
  }
  const source = lines.slice(i).join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
  return { meta, source };
}

/** Título de uma página HTML (<title>), quando o cabeçalho não trouxe um. */
function htmlTitle(source: string) {
  return source.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim() ?? "";
}

export function looksLikeHtml(source: string) {
  return /^\s*(<!doctype html|<html|<head|<body|<div|<main|<section|<canvas|<svg|<style|<script)/i.test(source) || /<\/(div|script|body|html|canvas|svg)>/i.test(source);
}

export function parseArtifactBlocks(text: string): ArtifactBlock[] {
  return fences(text)
    .filter((f) => f.lang === "artefato")
    .map((f) => {
      const { meta, source } = parseArtifactBody(f.body);
      const kind = kindFrom(meta.tipo || meta.type);
      // O conteúdo decide: HTML vira página (na caixa de areia) mesmo que o cabeçalho diga markdown.
      const format: ArtifactFormat = !looksLikeHtml(source) && (meta.formato === "markdown" || kind === "documento") ? "markdown" : "html";
      return {
        title: (meta.titulo || meta.title || htmlTitle(source) || "Artefato").slice(0, 120),
        kind,
        description: meta.descricao || meta.description || "",
        category: meta.categoria || meta.category || "",
        ref: (meta.ref || meta.id || "").replace(/[^\w-]/g, "") || null,
        format,
        source,
        raw: f.raw,
        closed: f.closed,
      };
    });
}

export function parseEditBlocks(text: string): EditBlock[] {
  return fences(text)
    .filter((f) => f.lang === "artefato-edicao")
    .map((f) => {
      const note = f.body.match(/^\s*nota\s*:\s*(.*)$/im)?.[1]?.trim() ?? "";
      const edits: { search: string; replace: string }[] = [];
      const re = /<{5,}\s*BUSCAR[^\n]*\n([\s\S]*?)\n?={5,}[^\n]*\n([\s\S]*?)\n?>{5,}\s*FIM[^\n]*/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.body))) edits.push({ search: m[1], replace: m[2] });
      return { note, edits, raw: f.raw, closed: f.closed };
    });
}

export function serializeArtifact(a: { title: string; kind: ArtifactKind; description?: string; category?: string; ref?: string | null; format?: ArtifactFormat; source: string }) {
  const head = [
    `titulo: ${a.title.replace(/\n/g, " ")}`,
    `tipo: ${a.kind}`,
    a.description ? `descricao: ${a.description.replace(/\n/g, " ")}` : "",
    a.category ? `categoria: ${a.category.replace(/\n/g, " ")}` : "",
    a.ref ? `ref: ${a.ref}` : "",
    a.format === "markdown" ? "formato: markdown" : "",
  ].filter(Boolean);
  // Cerca mais longa que qualquer sequência de crases dentro do código (assim o código nunca fecha o bloco).
  const longest = Math.max(2, ...[...a.source.matchAll(/`{3,}/g)].map((m) => m[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}artefato\n${head.join("\n")}\n---\n${a.source}\n${fence}`;
}
