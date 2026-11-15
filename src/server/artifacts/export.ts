import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { browserPath } from "./runtime";

/**
 * Arquivos a partir de um artefato (pedido do dono do projeto, 15/11/2026: "construir PDFs e outros tipos de arquivos
 * para o usuário"):
 *  - pdf: o próprio Chrome/Edge invisível imprime a página (o mesmo navegador do teste, runtime.ts). Documento em
 *    Markdown vira uma página de leitura clara (fundo branco, títulos roxos, tabelas com borda) antes de imprimir;
 *    página interativa sai como está na tela, com o fundo escuro (print-color-adjust).
 *  - html: uma página que abre sozinha em qualquer navegador (o tema da Mente embutido).
 *  - md: o texto do documento.
 * O Markdown é convertido pelo marked do CDN (o mesmo do app), dentro do navegador: o servidor não ganha dependência.
 */

export const EXPORT_FORMATS = ["pdf", "html", "md"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const THEME =
  ":root{--mm-bg:#000;--mm-surface:#0B0A0E;--mm-surface-2:#131217;--mm-line:#2A2732;--mm-text:#F2EFFA;--mm-muted:#AAA4BF;--mm-faint:#867FA1;--mm-roxo:#8461F0;--mm-roxo-claro:#A58BF7;--mm-roxo-escuro:#4A2B9B;--mm-verde:#8FDDB0;--mm-amarelo:#E8C07D;--mm-vermelho:#F2777A;--mm-fonte:'Instrument Sans',-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;color-scheme:dark}html{background:var(--mm-bg);color:var(--mm-text);font-family:var(--mm-fonte)}body{margin:0}";

/**
 * A mesma política de conteúdo da caixa de areia (scripts só das CDNs; nada de rede): o Chrome do servidor, ao imprimir,
 * não pode ser usado para mandar pedidos ao próprio PC (Ollama, a API local) nem a outros endereços.
 */
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src data: https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://fonts.gstatic.com; img-src data: blob:; media-src data: blob:; connect-src 'none'; worker-src blob:; frame-src 'none'; form-action 'none'; base-uri 'none'">`;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Página de leitura de um documento Markdown (para PDF e para o .html). */
function documentPage(title: string, markdown: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">${CSP_META}<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap">
<style>
@page{size:A4;margin:18mm 16mm}
html{background:#fff;color:#1b1726;font-family:'Newsreader',Georgia,serif;font-size:12pt;line-height:1.55}
body{max-width:760px;margin:0 auto;padding:24px}
h1,h2,h3,h4{font-family:'Instrument Sans',system-ui,sans-serif;color:#4A2B9B;line-height:1.25;break-after:avoid}
h1{font-size:24pt;margin:0 0 8px;border-bottom:2px solid #8461F0;padding-bottom:6px}
h2{font-size:16pt;margin-top:22px}h3{font-size:13pt}
a{color:#6236D4}
table{border-collapse:collapse;width:100%;margin:12px 0;font-family:'Instrument Sans',system-ui,sans-serif;font-size:10.5pt;break-inside:avoid}
th,td{border:1px solid #d9d2ef;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f1ecff;color:#2F1C64}
blockquote{margin:12px 0;padding:8px 14px;border-left:3px solid #8461F0;background:#f7f4ff;color:#3a3150}
code{font-family:Consolas,Menlo,monospace;font-size:10pt;background:#f3f1f8;padding:1px 4px;border-radius:4px}
pre{background:#f3f1f8;padding:10px;border-radius:8px;overflow:auto;break-inside:avoid}pre code{background:none;padding:0}
img{max-width:100%}
.rodape{margin-top:28px;font-family:'Instrument Sans',system-ui,sans-serif;font-size:9pt;color:#867FA1}
</style></head><body><main id="doc"></main><p class="rodape">${escapeHtml(title)} · feito na Mente</p>
<script src="https://cdn.jsdelivr.net/npm/marked@15.0.6/marked.min.js"></script>
<script id="fonte" type="text/markdown">${markdown.replace(/<\/script/gi, "<\\/script")}</script>
<script>
var md=document.getElementById("fonte").textContent;
document.getElementById("doc").innerHTML=window.marked?marked.parse(md,{gfm:true}):"<pre>"+md.replace(/&/g,"&amp;").replace(/</g,"&lt;")+"</pre>";
</script></body></html>`;
}

/** Página interativa, sozinha: o tema da Mente antes do código do artefato. */
function standalonePage(title: string, source: string) {
  const head = `<meta charset="utf-8">${CSP_META}<meta name="viewport" content="width=device-width,initial-scale=1"><style>${THEME}@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>`;
  let code = source.replace(/^\s*<!doctype[^>]*>/i, "");
  const headTag = code.match(/<head(\s[^>]*)?>/i);
  if (headTag?.index !== undefined) code = code.slice(0, headTag.index + headTag[0].length) + head + code.slice(headTag.index + headTag[0].length);
  else code = `<head>${head}<title>${escapeHtml(title)}</title></head><body>${code}</body>`;
  return `<!doctype html>${/<html[\s>]/i.test(code) ? code : `<html lang="pt-BR">${code}</html>`}`;
}

export function fileName(title: string, ext: string) {
  const base = title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 60) || "artefato";
  return `${base}.${ext}`;
}

async function printPdf(html: string): Promise<Buffer> {
  const exe = browserPath();
  if (!exe) throw new Error("Não há navegador no servidor para gerar o PDF.");
  const dir = await mkdtemp(path.join(tmpdir(), "mm-pdf-"));
  try {
    const page = path.join(dir, "pagina.html");
    const out = path.join(dir, "saida.pdf");
    await writeFile(page, html, "utf8");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        exe,
        ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync", `--user-data-dir=${path.join(dir, "perfil")}`, "--virtual-time-budget=6000", "--no-pdf-header-footer", "--print-to-pdf-no-header", `--print-to-pdf=${out}`, `file:///${page.replace(/\\/g, "/")}`],
        { windowsHide: true },
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("O navegador demorou demais para gerar o PDF."));
      }, 40_000);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    const pdf = await readFile(out).catch(() => null);
    if (!pdf || pdf.length < 100) throw new Error("O PDF não foi gerado.");
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function exportArtifact(a: { title: string; format: string; source: string }, to: ExportFormat): Promise<{ body: Buffer; type: string; name: string }> {
  const markdown = a.format === "markdown";
  if (to === "md") {
    return { body: Buffer.from(markdown ? a.source : `# ${a.title}\n\n\`\`\`html\n${a.source}\n\`\`\`\n`, "utf8"), type: "text/markdown; charset=utf-8", name: fileName(a.title, "md") };
  }
  const html = markdown ? documentPage(a.title, a.source) : standalonePage(a.title, a.source);
  if (to === "html") return { body: Buffer.from(html, "utf8"), type: "text/html; charset=utf-8", name: fileName(a.title, "html") };
  return { body: await printPdf(html), type: "application/pdf", name: fileName(a.title, "pdf") };
}
