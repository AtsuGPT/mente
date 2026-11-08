import { lexer, type Token, type Tokens } from "marked";

/**
 * Conteúdo estruturado dentro do Markdown (o formato canônico dos pensamentos e das respostas da
 * Kally): tabelas GFM e diagramas Mermaid em bloco ```mermaid. Tudo continua sendo texto
 * Markdown, então salva, transmite em streaming, guarda no histórico e passa para o editor sem
 * conversão; o app só reconhece e desenha esses blocos.
 */

/* ------------------------------- Mermaid -------------------------------- */

/** Altura máxima do diagrama no meio do texto: mais alto que isso, ele encolhe para caber (a tela cheia mostra no tamanho real). */
export const FIT_MAX_HEIGHT = 820;

/** Versão fixa do Mermaid (servido pelo jsDelivr dentro de uma caixa isolada). */
export const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js";

/** O bloco de código já fechou? Durante o streaming ele chega aos pedaços. */
export function fenceClosed(raw: string) {
  const open = /^ {0,3}(`{3,}|~{3,})/.exec(raw);
  if (!open) return true;
  const fence = open[1];
  const lines = raw.trimEnd().split("\n");
  if (lines.length < 2) return false;
  const last = lines[lines.length - 1].trim();
  return last.startsWith(fence[0].repeat(fence.length)) && /^(`{3,}|~{3,})$/.test(last);
}

export const isMermaid = (token: Token): boolean => token.type === "code" && /^mermaid\b/i.test((token as Tokens.Code).lang ?? "");

/**
 * Página que desenha um diagrama. Roda isolada (WebView no celular, iframe com sandbox sem
 * mesma origem na web): o código vem como dado JSON (nunca como HTML), o Mermaid fica em
 * securityLevel "strict" (rótulos sem HTML, sem cliques nem scripts) e o resultado volta por
 * postMessage com a altura medida.
 */
export function diagramHtml({ source, id, fit }: { source: string; id: string; fit: boolean }) {
  const data = JSON.stringify({ source, id }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1${fit ? ",maximum-scale=1" : ",maximum-scale=5,user-scalable=yes"}">
<style>
html,body{margin:0;padding:0;background:transparent;color:#F2EFFA;-webkit-text-size-adjust:100%}
#d{display:flex;justify-content:center;padding:6px 2px}
#d svg{${fit ? "max-width:100%;max-height:" + FIT_MAX_HEIGHT + "px;height:auto" : "max-width:none"}}
${fit ? "" : "body{overflow:auto}#d{justify-content:flex-start;padding:16px;min-width:max-content}"}
</style></head><body><div id="d"></div>
<script src="${MERMAID_URL}"></script>
<script>
(function(){
  var input = ${data};
  function post(message){
    message.id = input.id;
    var text = JSON.stringify(message);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text); else window.parent.postMessage(text, "*");
  }
  if (!window.mermaid) { post({ type: "error", message: "Sem conexão para carregar o desenhista de diagramas." }); return; }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif",
    flowchart: { htmlLabels: false, curve: "basis", padding: 12 },
    themeVariables: {
      darkMode: true,
      background: "#000000",
      fontSize: "14px",
      primaryColor: "#17141F",
      primaryTextColor: "#F2EFFA",
      primaryBorderColor: "#8461F0",
      secondaryColor: "#131217",
      secondaryTextColor: "#F2EFFA",
      secondaryBorderColor: "#4A2B9B",
      tertiaryColor: "#0B0A0E",
      tertiaryTextColor: "#F2EFFA",
      tertiaryBorderColor: "#2A2732",
      lineColor: "#A58BF7",
      textColor: "#F2EFFA",
      mainBkg: "#17141F",
      nodeBorder: "#8461F0",
      clusterBkg: "#0B0A0E",
      clusterBorder: "#2A2732",
      edgeLabelBackground: "#0B0A0E",
      noteBkgColor: "#1E1240",
      noteTextColor: "#F2EFFA",
      noteBorderColor: "#4A2B9B",
      actorBkg: "#17141F",
      actorBorder: "#8461F0",
      actorTextColor: "#F2EFFA",
      signalColor: "#A58BF7",
      signalTextColor: "#F2EFFA"
    }
  });
  mermaid.render("m" + Math.random().toString(36).slice(2), input.source).then(function (result) {
    var box = document.getElementById("d");
    box.innerHTML = result.svg;
    var svg = box.querySelector("svg");
    var natural = svg && svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.width : 0;
    requestAnimationFrame(function () {
      post({ type: "ok", height: Math.ceil(document.body.scrollHeight), width: Math.ceil(natural) });
    });
  }).catch(function (error) {
    post({ type: "error", message: String((error && error.message) || error).slice(0, 240) });
  });
})();
</script></body></html>`;
}

/** Mensagem de volta da página do diagrama (ignorada se não for desta instância). */
export function readDiagramMessage(raw: unknown, id: string): { type: "ok"; height: number; width: number } | { type: "error"; message: string } | null {
  if (typeof raw !== "string") return null;
  try {
    const message = JSON.parse(raw);
    if (!message || message.id !== id) return null;
    if (message.type === "ok" && Number.isFinite(message.height)) return { type: "ok", height: Number(message.height), width: Number(message.width) || 0 };
    if (message.type === "error") return { type: "error", message: String(message.message ?? "") };
  } catch {
    // mensagem de outra origem
  }
  return null;
}

/* -------------------------------- Tabelas -------------------------------- */

export type TableData = { header: string[]; rows: string[][] };

/** Texto da célula sem a marcação de linha (para medir largura). */
export function plainCell(text: string) {
  return text.replace(/\\\|/g, "|").replace(/[*_`~]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
}

const escapeCell = (text: string) => text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

/** Tabela → GFM, com colunas alinhadas no texto (fica legível também como Markdown puro). */
export function tableToMarkdown(table: TableData) {
  const columns = Math.max(1, table.header.length);
  const normalize = (row: string[]) => Array.from({ length: columns }, (_, i) => escapeCell(row[i] ?? ""));
  const header = normalize(table.header).map((cell, i) => cell || `Coluna ${i + 1}`);
  const rows = table.rows.map(normalize);
  const widths = header.map((cell, i) => Math.max(3, cell.length, ...rows.map((row) => row[i].length)));
  const line = (cells: string[]) => `| ${cells.map((cell, i) => cell.padEnd(widths[i])).join(" | ")} |`;
  return [line(header), `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`, ...rows.map(line)].join("\n");
}

export function tableFromToken(token: Tokens.Table): TableData {
  return { header: token.header.map((cell) => cell.text), rows: token.rows.map((row) => row.map((cell) => cell.text)) };
}

/* --------------------------- Blocos no editor ---------------------------- */

export type StructuredBlock =
  | { kind: "table"; start: number; end: number; table: TableData }
  | { kind: "diagram"; start: number; end: number; source: string };

/**
 * Tabelas e diagramas do texto, com a posição de cada um (para editar no lugar). As posições
 * vêm da soma dos trechos originais dos blocos de nível superior, que reconstituem o texto.
 */
export function findStructuredBlocks(markdown: string): StructuredBlock[] {
  const blocks: StructuredBlock[] = [];
  let offset = 0;
  for (const token of lexer(markdown, { gfm: true })) {
    const start = markdown.indexOf(token.raw, offset);
    if (start < 0) continue;
    const end = start + token.raw.trimEnd().length;
    if (token.type === "table") blocks.push({ kind: "table", start, end, table: tableFromToken(token as Tokens.Table) });
    else if (isMermaid(token) && fenceClosed(token.raw)) blocks.push({ kind: "diagram", start, end, source: (token as Tokens.Code).text });
    offset = start + token.raw.length;
  }
  return blocks;
}

/** O bloco em que o cursor está (ou nenhum). */
export function blockAt(markdown: string, position: number) {
  return findStructuredBlocks(markdown).find((block) => position >= block.start && position <= block.end) ?? null;
}

export const diagramToMarkdown = (source: string) => `\`\`\`mermaid\n${source.trim()}\n\`\`\``;

/** O texto tem algo que vale levar ao editor com a formatação (tabela, diagrama, código, títulos)? */
export function hasStructure(markdown: string) {
  return /^\s*\|.+\|\s*$/m.test(markdown) && /^\s*\|?\s*:?-{3,}/m.test(markdown) ? true : /```|^#{1,3} /m.test(markdown);
}

export const DIAGRAM_TEMPLATE = `flowchart TD
  A["Início"] --> B["Etapa"]
  B --> C{"Decisão?"}
  C -->|"sim"| D["Resultado"]
  C -->|"não"| B`;
