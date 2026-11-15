import type { IconName } from "@/components/ui/icon";
import { colors } from "@/theme/tokens";

/**
 * Artefatos no app: tipos, leitura do bloco ```artefato que a Kally escreve e a "caixa de areia" onde o código roda.
 * O servidor tem a mesma leitura em src/server/artifacts/block.ts (os dois projetos não compartilham código).
 *
 * SEGURANÇA. O código de um artefato foi escrito por um modelo (ou por qualquer pessoa do ambiente) e nunca roda no
 * app. Ele roda numa página à parte:
 *  - web: <iframe sandbox="allow-scripts"> sem "allow-same-origin" → origem opaca: sem cookies, sem armazenamento e sem
 *    acesso ao DOM, ao token ou às rotas do app; sem popups, sem navegar a página de cima, sem enviar formulários;
 *  - celular: WebView separada, sem acesso a arquivos, com navegação bloqueada (só a página inicial) e sem a ponte do
 *    app (as mensagens que ela manda são só lidas por um filtro: altura, pronto, erro);
 *  - nos dois: uma política de conteúdo (CSP) colocada ANTES do código bloqueia rede (fetch, WebSocket, imagens de
 *    fora), formulários e páginas embutidas, e só deixa carregar scripts de três CDNs com versão fixa. Uma CSP lida
 *    pelo navegador não pode ser desligada depois pelo código da página.
 */

export const ARTIFACT_KINDS = ["simulador", "grafico", "diagrama", "documento", "codigo", "ferramenta"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const KIND_INFO: Record<ArtifactKind, { label: string; plural: string; icon: IconName; color: string }> = {
  simulador: { label: "Simulador", plural: "Simuladores", icon: "sliders", color: "#A58BF7" },
  grafico: { label: "Gráfico", plural: "Gráficos", icon: "chart", color: "#8FC8F2" },
  diagrama: { label: "Diagrama", plural: "Diagramas", icon: "flow", color: "#C7B7FA" },
  documento: { label: "Documento", plural: "Documentos", icon: "doc", color: "#E8C07D" },
  codigo: { label: "Código", plural: "Código", icon: "code", color: "#8FDDB0" },
  ferramenta: { label: "Ferramenta", plural: "Ferramentas", icon: "cube", color: "#F2A5C8" },
};

export function kindOf(value: string | null | undefined): ArtifactKind {
  return (ARTIFACT_KINDS as readonly string[]).includes(value ?? "") ? (value as ArtifactKind) : "ferramenta";
}

/* --------------------------- Leitura do bloco --------------------------- */

export type ArtifactBlock = { title: string; kind: ArtifactKind; description: string; category: string; ref: string | null; format: "html" | "markdown"; source: string };

const KEY = /^\s*(titulo|título|title|tipo|type|descricao|descrição|description|categoria|category|ref|id|formato)\s*:\s*(.*)$/i;
const fold = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const KIND_WORDS: [RegExp, ArtifactKind][] = [
  [/simula|experiment|laborat/, "simulador"],
  [/grafic|visualiz|dashboard|painel|estatist/, "grafico"],
  [/diagram|fluxo|mapa|arvore|grafo|arquitet/, "diagrama"],
  [/document|texto|relatori|resumo/, "documento"],
  [/codig|componente|demo|react|html/, "codigo"],
];

function kindFromText(value: string): ArtifactKind | null {
  const v = fold(value.trim());
  if (!v) return null;
  if ((ARTIFACT_KINDS as readonly string[]).includes(v)) return v as ArtifactKind;
  return KIND_WORDS.find(([re]) => re.test(v))?.[1] ?? (v ? "ferramenta" : null);
}

export const looksLikeHtml = (s: string) => /^\s*(<!doctype html|<html|<head|<body|<div|<main|<section|<canvas|<svg|<style|<script)/i.test(s) || /<\/(div|script|body|html|canvas|svg)>/i.test(s);

/** Corpo de um bloco ```artefato (o que vem entre as cercas): cabeçalho "chave: valor", ---, código. */
export function parseArtifactBody(body: string): ArtifactBlock {
  const lines = body.split("\n");
  const meta: Record<string, string> = {};
  let i = 0;
  for (; i < Math.min(lines.length, 16); i++) {
    const line = lines[i];
    if (/^\s*-{3,}\s*$/.test(line)) {
      i += 1;
      break;
    }
    const k = line.match(KEY);
    if (!k) {
      if (!line.trim() && !Object.keys(meta).length) continue;
      break;
    }
    meta[fold(k[1])] = k[2].trim();
  }
  const source = lines.slice(i).join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
  const kind = kindFromText(meta.tipo || meta.type || "") ?? "ferramenta";
  // O conteúdo decide: HTML vira página (na caixa de areia) mesmo que o cabeçalho diga markdown.
  const format = !looksLikeHtml(source) && (meta.formato === "markdown" || kind === "documento") ? "markdown" : "html";
  return {
    title: (meta.titulo || meta.title || source.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1] || "Artefato").trim().slice(0, 120),
    kind,
    description: meta.descricao || meta.description || "",
    category: meta.categoria || meta.category || "",
    ref: (meta.ref || meta.id || "").replace(/[^\w-]/g, "") || null,
    format,
    source,
  };
}

/** O último artefato completo de um texto (a resposta da Kally), para mandar como contexto do próximo pedido. */
export function lastArtifactIn(text: string): ArtifactBlock | null {
  const re = /^(`{3,}|~{3,})[ \t]*artefato[ \t]*$/gim;
  let found: ArtifactBlock | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const fence = m[1];
    const start = m.index + m[0].length + 1;
    const close = new RegExp(`^${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`, "m").exec(text.slice(start));
    if (!close) break;
    found = parseArtifactBody(text.slice(start, start + close.index));
    re.lastIndex = start + close.index + close[0].length;
  }
  return found;
}

/** Bloco para incorporar um artefato salvo num pensamento (o pensamento guarda só a referência). */
export function embedBlock(artifact: { id: string; title: string }) {
  return `\`\`\`artefato-ref\nid: ${artifact.id}\ntitulo: ${artifact.title.replace(/\n/g, " ")}\n\`\`\``;
}

export function parseEmbed(body: string) {
  const id = body.match(/^\s*id\s*:\s*([\w-]+)/im)?.[1] ?? null;
  const title = body.match(/^\s*t[ií]tulo\s*:\s*(.+)$/im)?.[1]?.trim() ?? "Artefato";
  return id ? { id, title } : null;
}

/* ---------------------------- Caixa de areia ---------------------------- */

const CDNS = "https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com";

/** Política de conteúdo da caixa: scripts só das CDNs; nada de rede, formulários, páginas embutidas ou <base>. */
export const ARTIFACT_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${CDNS}`,
  `style-src 'unsafe-inline' ${CDNS} https://fonts.googleapis.com`,
  `font-src data: ${CDNS} https://fonts.gstatic.com`,
  "img-src data: blob:",
  "media-src data: blob:",
  "connect-src 'none'",
  "worker-src blob:",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

const THEME = `:root{--mm-bg:${colors.bg};--mm-surface:${colors.surface};--mm-surface-2:${colors.surfaceRaised};--mm-line:${colors.lineStrong};--mm-text:${colors.text};--mm-muted:${colors.muted};--mm-faint:${colors.faint};--mm-roxo:${colors.violet500};--mm-roxo-claro:${colors.violet400};--mm-roxo-escuro:${colors.violet700};--mm-verde:${colors.success};--mm-amarelo:${colors.warning};--mm-vermelho:${colors.danger};--mm-fonte:"Instrument Sans",-apple-system,system-ui,"Segoe UI",Roboto,sans-serif;color-scheme:dark}
html{background:var(--mm-bg);color:var(--mm-text);font-family:var(--mm-fonte);-webkit-text-size-adjust:100%}
body{margin:0}`;

/**
 * Script da caixa (roda antes do código do artefato): mede a altura e avisa quando carregou ou quando deu erro, troca
 * alert/confirm/prompt (bloqueados na caixa) e localStorage (inexistente numa origem opaca) por versões em memória,
 * para o artefato não quebrar por isso. As mensagens levam o id da caixa; o app ignora qualquer outra.
 * Altura que só cresce (um gráfico que ocupa a altura do quadro, o quadro cresce com ele, e assim por diante) é travada
 * depois de 5 aumentos seguidos; um toque ou digitação no artefato volta a medir.
 */
function bootstrap(id: string, maxHeight: number) {
  return `(function(){
var id=${JSON.stringify(id)};
function post(m){m.id=id;m.mm="artefato";var t=JSON.stringify(m);try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(t);else window.parent.postMessage(t,"*");}catch(e){}}
function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("_")}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}});
window.alert=function(m){post({type:"aviso",message:String(m).slice(0,300)})};window.confirm=function(){return true};window.prompt=function(_,d){return d==null?"":String(d)};
var errs=0;function fail(m){if(errs++<3)post({type:"erro",message:String(m).slice(0,300)})}
window.addEventListener("error",function(e){if(e&&e.message)fail(e.message+(e.lineno?" (linha "+e.lineno+")":""));else if(e&&e.target&&e.target.src)fail("Não carregou: "+e.target.src)},true);
window.addEventListener("unhandledrejection",function(e){fail(e&&e.reason&&e.reason.message||e&&e.reason||"erro")});
var last=0,ups=0,lastUp=0,runFrom=0,frozen=false;
function size(){if(frozen)return;var b=document.body;if(!b)return;var r=b.getBoundingClientRect(),cs=getComputedStyle(b);var h=Math.ceil(Math.max(r.height+parseFloat(cs.marginTop||0)+parseFloat(cs.marginBottom||0),b.scrollHeight));h=Math.min(h,${maxHeight});if(Math.abs(h-last)<=2)return;
var now=Date.now();if(h>last&&last>0){if(now-lastUp<2500){ups++}else{ups=1;runFrom=last}lastUp=now;
if(ups>=5){frozen=true;last=Math.max(runFrom,160);post({type:"altura",height:last});return}}
last=h;post({type:"altura",height:h})}
["click","input","change","keydown"].forEach(function(t){document.addEventListener(t,function(){if(frozen){frozen=false;ups=0}setTimeout(size,80)},true)});
window.addEventListener("load",function(){size();post({type:"pronto"});setTimeout(size,250);setTimeout(size,1200)});
document.addEventListener("DOMContentLoaded",size);
if(window.ResizeObserver){try{new ResizeObserver(size).observe(document.documentElement)}catch(_){}}
setInterval(size,1500);
})();`;
}

/** A página completa da caixa: CSP e script da caixa primeiro, depois o código do artefato como ele é. */
export function artifactHtml({ source, id, maxHeight = 4000 }: { source: string; id: string; maxHeight?: number }) {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap"><style>${THEME}</style><script>${bootstrap(id, maxHeight).replace(/<\/script/gi, "<\\/script")}</script>`;
  const code = source.replace(/^\s*<!doctype[^>]*>/i, "");
  const headTag = code.match(/<head(\s[^>]*)?>/i);
  if (headTag?.index !== undefined) {
    const at = headTag.index + headTag[0].length;
    return `<!doctype html>${code.slice(0, at)}${head}${code.slice(at)}`;
  }
  const htmlTag = code.match(/<html(\s[^>]*)?>/i);
  if (htmlTag?.index !== undefined) {
    const at = htmlTag.index + htmlTag[0].length;
    return `<!doctype html>${code.slice(0, at)}<head>${head}</head>${code.slice(at)}`;
  }
  return `<!doctype html><html lang="pt-BR"><head>${head}</head><body>${code}</body></html>`;
}

export type SurfaceMessage = { type: "altura"; height: number } | { type: "pronto" } | { type: "erro"; message: string } | { type: "aviso"; message: string };

/** Mensagem da caixa (só as que trazem o id dela e um tipo conhecido; o resto é ignorado). */
export function readSurfaceMessage(raw: unknown, id: string): SurfaceMessage | null {
  if (typeof raw !== "string" || raw.length > 2_000) return null;
  try {
    const m = JSON.parse(raw);
    if (!m || m.id !== id || m.mm !== "artefato") return null;
    if (m.type === "altura" && Number.isFinite(m.height)) return { type: "altura", height: Math.max(0, Math.min(Number(m.height), 6000)) };
    if (m.type === "pronto") return { type: "pronto" };
    if (m.type === "erro" || m.type === "aviso") return { type: m.type, message: String(m.message ?? "").slice(0, 300) };
  } catch {
    // não é da caixa
  }
  return null;
}

/* ------------------------- Modelos para começar ------------------------- */

const page = (title: string, style: string, body: string, script: string, libs: string[] = []) =>
  `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${libs.map((src) => `<script src="${src}"></script>`).join("\n")}
<style>
  body { margin: 0; padding: 16px; background: var(--mm-bg); color: var(--mm-text); font-family: var(--mm-fonte); }
${style}
</style>
</head>
<body>
${body}
<script>
${script}
</script>
</body>
</html>`;

/** Pontos de partida para criar à mão (Artefatos → Novo). */
export const TEMPLATES: Record<ArtifactKind, { title: string; description: string; source: string }> = {
  simulador: {
    title: "Pêndulo simples",
    description: "Período e movimento de um pêndulo, com comprimento e gravidade ajustáveis.",
    source: page(
      "Pêndulo simples",
      `  .linha { display: flex; justify-content: space-between; color: var(--mm-muted); font-size: 14px; margin-top: 10px; }
  input[type=range] { width: 100%; accent-color: var(--mm-roxo); }
  canvas { width: 100%; height: auto; display: block; background: var(--mm-surface); border: 1px solid var(--mm-line); border-radius: 12px; }`,
      `<canvas id="c" width="640" height="300"></canvas>
<div class="linha"><span>Comprimento</span><b id="lv"></b></div><input id="l" type="range" min="0.2" max="3" step="0.1" value="1.2">
<div class="linha"><span>Gravidade</span><b id="gv"></b></div><input id="g" type="range" min="1" max="25" step="0.1" value="9.8">
<p id="saida"></p>`,
      `const c = document.getElementById("c"), ctx = c.getContext("2d");
const L = document.getElementById("l"), G = document.getElementById("g");
let t0 = performance.now();
function fmt(n) { return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
function frame(now) {
  const l = +L.value, g = +G.value, theta0 = 0.5; // amplitude de ~29°
  const w = Math.sqrt(g / l), T = 2 * Math.PI / w; // período (pequenas oscilações)
  const theta = theta0 * Math.cos(w * (now - t0) / 1000);
  document.getElementById("lv").textContent = fmt(l) + " m";
  document.getElementById("gv").textContent = fmt(g) + " m/s²";
  document.getElementById("saida").textContent = "Período T = 2π√(L/g) = " + fmt(T) + " s";
  ctx.clearRect(0, 0, c.width, c.height);
  const ox = c.width / 2, oy = 20, px = ox + Math.sin(theta) * l * 85, py = oy + Math.cos(theta) * l * 85;
  ctx.strokeStyle = "#A58BF7"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke();
  ctx.fillStyle = "#8461F0"; ctx.beginPath(); ctx.arc(px, py, 14, 0, 2 * Math.PI); ctx.fill();
  requestAnimationFrame(frame);
}
L.oninput = G.oninput = () => (t0 = performance.now());
requestAnimationFrame(frame);`,
    ),
  },
  grafico: {
    title: "Gráfico de uma função",
    description: "Curva de f(x) = a·sen(bx) com a e b ajustáveis.",
    source: page(
      "Gráfico de uma função",
      `  .linha { display: flex; justify-content: space-between; color: var(--mm-muted); font-size: 14px; margin-top: 10px; }
  input[type=range] { width: 100%; accent-color: var(--mm-roxo); }
  .caixa { background: var(--mm-surface); border: 1px solid var(--mm-line); border-radius: 12px; padding: 8px; }`,
      `<div class="caixa"><canvas id="grafico" height="220"></canvas></div>
<div class="linha"><span>Amplitude a</span><b id="av"></b></div><input id="a" type="range" min="0.5" max="3" step="0.1" value="1">
<div class="linha"><span>Frequência b</span><b id="bv"></b></div><input id="b" type="range" min="0.5" max="4" step="0.1" value="1">`,
      `const A = document.getElementById("a"), B = document.getElementById("b");
const xs = Array.from({ length: 121 }, (_, i) => -6 + i * 0.1);
const chart = new Chart(document.getElementById("grafico"), {
  type: "line",
  data: { labels: xs.map((x) => x.toFixed(1)), datasets: [{ label: "f(x)", data: [], borderColor: "#A58BF7", pointRadius: 0, borderWidth: 2 }] },
  options: { animation: false, scales: { x: { ticks: { color: "#867FA1", maxTicksLimit: 7 }, grid: { color: "#1C1A22" } }, y: { min: -3.2, max: 3.2, ticks: { color: "#867FA1" }, grid: { color: "#1C1A22" } } }, plugins: { legend: { labels: { color: "#F2EFFA" } } } },
});
function update() {
  const a = +A.value, b = +B.value;
  document.getElementById("av").textContent = a.toLocaleString("pt-BR");
  document.getElementById("bv").textContent = b.toLocaleString("pt-BR");
  chart.data.datasets[0].data = xs.map((x) => a * Math.sin(b * x));
  chart.update();
}
A.oninput = B.oninput = update;
update();`,
      ["https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"],
    ),
  },
  diagrama: {
    title: "Fluxograma",
    description: "Um fluxograma simples desenhado com Mermaid.",
    source: page(
      "Fluxograma",
      `  .mermaid { display: flex; justify-content: center; }`,
      `<div class="mermaid">
flowchart TD
  A[Início] --> B{Entendi o conteúdo?}
  B -- Sim --> C[Fazer exercícios]
  B -- Não --> D[Revisar com a Kally]
  D --> B
  C --> E[Fim]
</div>`,
      `mermaid.initialize({ startOnLoad: true, theme: "dark", themeVariables: { primaryColor: "#17141F", primaryBorderColor: "#8461F0", lineColor: "#A58BF7", primaryTextColor: "#F2EFFA" } });`,
      ["https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"],
    ),
  },
  documento: {
    title: "Roteiro de estudo",
    description: "Documento estruturado em Markdown.",
    source: "# Roteiro de estudo\n\n## Objetivo\n\nO que eu quero saber ao final.\n\n## Tópicos\n\n1. Primeiro tópico\n2. Segundo tópico\n\n## Exercícios\n\n- [ ] Lista 1\n- [ ] Lista 2\n",
  },
  codigo: {
    title: "Contador em React",
    description: "Componente React sem compilação (htm).",
    source: page(
      "Contador em React",
      `  button { background: var(--mm-roxo); color: #fff; border: 0; border-radius: 999px; padding: 10px 18px; font: inherit; min-height: 40px; }
  .numero { font-size: 48px; margin: 12px 0; }`,
      `<div id="raiz"></div>`,
      `const html = htm.bind(React.createElement);
function Contador() {
  const [n, setN] = React.useState(0);
  return html\`<div><div class="numero">\${n}</div><button onClick=\${() => setN(n + 1)}>Somar 1</button></div>\`;
}
ReactDOM.createRoot(document.getElementById("raiz")).render(html\`<\${Contador} />\`);`,
      ["https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js", "https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js", "https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js"],
    ),
  },
  ferramenta: {
    title: "Calculadora de IMC",
    description: "Índice de massa corporal a partir de peso e altura.",
    source: page(
      "Calculadora de IMC",
      `  label { display: block; color: var(--mm-muted); font-size: 14px; margin-top: 12px; }
  input { width: 100%; box-sizing: border-box; background: var(--mm-surface); color: var(--mm-text); border: 1px solid var(--mm-line); border-radius: 10px; padding: 10px; font: inherit; min-height: 42px; }
  .resultado { margin-top: 16px; padding: 14px; border-radius: 12px; background: var(--mm-surface); border: 1px solid var(--mm-line); }`,
      `<label>Peso (kg)<input id="peso" type="number" value="70" min="1"></label>
<label>Altura (m)<input id="altura" type="number" value="1.75" step="0.01" min="0.5"></label>
<div class="resultado" id="r"></div>`,
      `function calcular() {
  const p = +document.getElementById("peso").value, h = +document.getElementById("altura").value;
  const imc = p / (h * h);
  const faixa = imc < 18.5 ? "abaixo do peso" : imc < 25 ? "peso adequado" : imc < 30 ? "sobrepeso" : "obesidade";
  document.getElementById("r").textContent = "IMC = " + imc.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " (" + faixa + ")";
}
document.querySelectorAll("input").forEach((i) => (i.oninput = calcular));
calcular();`,
    ),
  },
};
