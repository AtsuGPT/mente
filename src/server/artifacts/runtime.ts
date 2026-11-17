import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Teste de verdade antes de entregar: o artefato roda num Chrome (ou Edge) invisível do próprio PC, com a mesma
 * política de conteúdo da caixa do app, e o teste que a Kally escreveu para o pedido (```teste-artefato) clica, digita
 * e confere o resultado. Erros de JavaScript ao carregar e afirmações que falham voltam para a Kally corrigir.
 *
 * Por que assim: a validação estática (validate.ts) não vê erro de lógica. No laboratório cósmico (15/11), o código
 * era válido, mas "esconder o painel e trazer de volta" não funcionava, e a Kally dizia que tinha resolvido.
 *
 * Segurança: o código roda no navegador, nunca no Node; o navegador usa um perfil temporário próprio (apagado no fim),
 * sem extensões, com a caixa de areia do Chrome ligada, e a CSP bloqueia rede (fetch, imagens), formulários e
 * molduras; o arquivo é lido como file:// e o Chrome não deixa uma página file:// ler outros arquivos. Sem navegador
 * no servidor (ex.: o contêiner de teste), o teste é pulado e o resto segue como antes.
 *
 * Como o resultado sai: --dump-dom imprime o HTML depois de os scripts rodarem (com tempo virtual, as esperas e as
 * animações correm sem esperar o relógio); o resultado do teste fica num <pre id="__mm_resultado">.
 * Sem tela, o Chrome não desenha quadros e o requestAnimationFrame nunca dispara: aqui ele vira um setTimeout de 16 ms
 * (medido em 15/11: 0 quadros em 1 s; o cronômetro e o laboratório pareciam parados e a Kally "consertava" código certo).
 */

const CANDIDATES = [
  process.env.KALLY_ARTIFACT_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/opt/pw-browsers/chromium",
].filter((p): p is string => !!p);

let found: string | null | undefined;
export function browserPath() {
  if (process.env.KALLY_ARTIFACT_TEST === "0") return null;
  if (found === undefined) found = CANDIDATES.find((p) => existsSync(p)) ?? null;
  return found;
}

const CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src data: https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://fonts.gstatic.com; img-src data: blob:; media-src data: blob:; connect-src 'none'; worker-src blob:; frame-src 'none'; form-action 'none'; base-uri 'none'";

const THEME =
  ":root{--mm-bg:#000;--mm-surface:#0B0A0E;--mm-surface-2:#131217;--mm-line:#2A2732;--mm-text:#F2EFFA;--mm-muted:#AAA4BF;--mm-faint:#867FA1;--mm-roxo:#8461F0;--mm-roxo-claro:#A58BF7;--mm-roxo-escuro:#4A2B9B;--mm-verde:#8FDDB0;--mm-amarelo:#E8C07D;--mm-vermelho:#F2777A;--mm-fonte:system-ui,sans-serif}";

/** Script que vem ANTES do artefato: guarda os erros e troca o que a caixa do app também troca. */
const BEFORE = `window.__mm={erros:[],nulos:[],testando:false};
(function(){function marca(q){if(!__mm.testando&&__mm.nulos.indexOf(q)<0&&__mm.nulos.length<12)__mm.nulos.push(q)}var g=Document.prototype.getElementById;Document.prototype.getElementById=function(id){var r=g.call(this,id);if(!r)marca("#"+id);return r};var qs=Document.prototype.querySelector;Document.prototype.querySelector=function(q){var r=qs.call(this,q);if(!r)marca(q);return r};var eq=Element.prototype.querySelector;Element.prototype.querySelector=function(q){var r=eq.call(this,q);if(!r)marca(q);return r}})();
addEventListener("error",function(e){if(e&&e.message)__mm.erros.push(e.message+(e.lineno?" (linha "+e.lineno+")":""));else if(e&&e.target&&(e.target.src||e.target.href))__mm.erros.push("Não carregou: "+(e.target.src||e.target.href))},true);
addEventListener("unhandledrejection",function(e){__mm.erros.push(String(e&&e.reason&&e.reason.message||e&&e.reason||"erro"))});
window.requestAnimationFrame=function(cb){return setTimeout(function(){cb(performance.now())},16)};window.cancelAnimationFrame=function(id){clearTimeout(id)};
window.alert=function(){};window.confirm=function(){return true};window.prompt=function(_,d){return d==null?"":String(d)};
(function(){function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}["localStorage","sessionStorage"].forEach(function(n){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}})})();`;

/** Script que vem DEPOIS: espera carregar, roda o teste e escreve o resultado. */
function after(test: string) {
  return `(function(){
var falhas=[],ok=0;
function q(s){var el=document.querySelector(s);if(!el)throw new Error("não existe: "+s);return el}
function existe(s){return !!document.querySelector(s)}
function visivel(s){var el=document.querySelector(s);if(!el)return false;var r=el.getBoundingClientRect();var cs=getComputedStyle(el);if(cs.display==="none"||cs.visibility==="hidden"||Number(cs.opacity)===0)return false;var p=el;while(p&&p!==document.documentElement){var c=getComputedStyle(p);if(c.display==="none"||c.visibility==="hidden")return false;p=p.parentElement}return r.width>0&&r.height>0}
function clicar(s){var el=q(s);el.dispatchEvent(new MouseEvent("pointerdown",{bubbles:true}));el.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}));el.dispatchEvent(new MouseEvent("pointerup",{bubbles:true}));el.dispatchEvent(new MouseEvent("mouseup",{bubbles:true}));if(typeof el.click==="function")el.click();else el.dispatchEvent(new MouseEvent("click",{bubbles:true}))}
function digitar(s,t){var el=q(s);el.focus();el.value=t;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}
function mudar(s,v){var el=q(s);if(el.type==="checkbox"||el.type==="radio"){if(el.checked!==!!v)el.click()}else{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}}
function texto(s){var el=document.querySelector(s);return el?(el.innerText||el.textContent||"").trim():""}
function esperar(ms){return new Promise(function(r){setTimeout(r,ms)})}
function afirmar(c,m){if(c)ok++;else falhas.push(String(m||"afirmação falhou"))}
function fim(extra){var pre=document.createElement("pre");pre.id="__mm_resultado";pre.textContent=JSON.stringify(Object.assign({erros:window.__mm.erros.slice(0,5),falhas:falhas.slice(0,10),ok:ok,nulos:window.__mm.nulos},extra||{}));document.documentElement.appendChild(pre)}
var codigo=${JSON.stringify(test).replace(/</g, "\\u003c")};
addEventListener("load",function(){setTimeout(async function(){
__mm.testando=true;
// Checagens automáticas (valem mesmo sem teste da Kally):
// 1) largura de celular: o Chrome invisível não abre menor que ~500 px, então a página é posta em 380 px por um
//    instante e se mede o que transborda (larguras fixas, tabelas, canvas sem escala).
try{var de=document.documentElement,w0=de.style.width;de.style.width="380px";var sw=document.body?document.body.scrollWidth:0;de.style.width=w0;if(sw>392&&Math.abs(sw-window.innerWidth)>2)falhas.push("transborda na largura do celular: o conteúdo ocupa "+sw+" px numa tela de 380 px (troque larguras fixas por width:100%/max-width e escale canvas e gráficos)")}catch(_){}
// 3) legibilidade no celular (17/11/2026): com a página em 380 px, rótulos que se sobrepõem e textos menores que 8 px na
//    tela (SVG escalado para caber encolhe o texto junto). Um caso isolado passa; vários viram conserto.
try{de.style.width="380px";var vis=function(el){var r=el.getBoundingClientRect();if(r.width<1||r.height<1)return null;var cs=getComputedStyle(el);if(cs.display==="none"||cs.visibility==="hidden"||+cs.opacity===0)return null;return r};
var labs=[].slice.call(document.querySelectorAll("svg text, [style*='position: absolute'], [style*='position:absolute']")).filter(function(el){return (el.textContent||"").trim().length>0&&el.textContent.trim().length<60&&!el.querySelector("text,div,p")});
var boxes=[];labs.forEach(function(el){var r=vis(el);if(r)boxes.push({el:el,r:r,t:el.textContent.trim().slice(0,24)})});
var sob=[];for(var a=0;a<boxes.length&&sob.length<6;a++)for(var b=a+1;b<boxes.length;b++){var A=boxes[a].r,B=boxes[b].r;var ix=Math.min(A.right,B.right)-Math.max(A.left,B.left),iy=Math.min(A.bottom,B.bottom)-Math.max(A.top,B.top);if(ix>0&&iy>0&&ix*iy>0.35*Math.min(A.width*A.height,B.width*B.height)&&!boxes[a].el.contains(boxes[b].el)&&!boxes[b].el.contains(boxes[a].el)){sob.push("«"+boxes[a].t+"» sobre «"+boxes[b].t+"»");break}}
if(sob.length>=2)falhas.push(sob.length+" rótulos se sobrepõem na tela do celular ("+sob.slice(0,3).join(", ")+"): afaste-os, encurte-os ou numere as partes e explique numa legenda");
var peq=[];[].slice.call(document.querySelectorAll("svg text")).forEach(function(el){var r=vis(el);if(!r||!(el.textContent||"").trim())return;var fs=parseFloat(getComputedStyle(el).fontSize)||0;var m=el.getScreenCTM&&el.getScreenCTM();var px=fs*(m?Math.sqrt(m.a*m.a+m.b*m.b):1);if(px>0&&px<8)peq.push("«"+el.textContent.trim().slice(0,20)+"» com "+px.toFixed(1)+" px")});
if(peq.length>=3)falhas.push(peq.length+" textos ficam menores que 8 px numa tela de 380 px ("+peq.slice(0,3).join(", ")+"): aumente o font-size em relação ao viewBox ou mostre o rótulo só ao tocar");
de.style.width=w0}catch(_){try{document.documentElement.style.width=""}catch(__){}}
// 2) questões montadas: cada window.QUESTOES[i].conta tem que dar o valor da alternativa marcada como correta.
try{if(Array.isArray(window.QUESTOES)){var num=function(t){var m=String(t).replace(/(\\d)\\s*[×x·]\\s*10\\s*\\^?\\s*(-?\\d+)/g,"$1e$2").match(/-?\\d[\\d.]*(?:,\\d+)?(?:e-?\\d+)?/i);if(!m)return NaN;var r=m[0];if(/,\\d+$/.test(r))r=r.replace(/\\./g,"").replace(",",".");else if(/^\\d{1,3}(\\.\\d{3})+$/.test(r))r=r.replace(/\\./g,"");return Number(r)};
window.QUESTOES.forEach(function(q,i){if(!q||!q.conta||!Array.isArray(q.opcoes))return;var v;try{v=Function("with(Math){return ("+String(q.conta).replace(/\\^/g,"**")+")}")()}catch(e){falhas.push("questão "+(i+1)+": a conta não roda ("+e.message+")");return}var c=num(q.opcoes[q.correta]);if(!(Math.abs(c-v)<=Math.max(1e-9,Math.abs(v)*0.011)))falhas.push("questão "+(i+1)+": a conta dá "+(+v.toPrecision(6))+", mas a alternativa marcada como correta é \\""+q.opcoes[q.correta]+"\\"");q.opcoes.forEach(function(o,j){if(j!==q.correta&&Math.abs(num(o)-v)<=Math.max(1e-9,Math.abs(v)*0.011))falhas.push("questão "+(i+1)+": a alternativa errada \\""+o+"\\" também tem o valor certo")})})}}catch(_){}
// O teste é compilado à parte: erro de sintaxe nele vira falha do teste, não da página.
try{var Async=Object.getPrototypeOf(async function(){}).constructor;await new Async("clicar","digitar","mudar","visivel","texto","existe","esperar","afirmar",codigo)(clicar,digitar,mudar,visivel,texto,existe,esperar,afirmar)}catch(e){falhas.push("o teste parou: "+(e&&e.message||e))}
fim()},400)});
})();`;
}

export type RuntimeReport = { ran: boolean; ok: boolean; errors: string[]; failures: string[]; passed: number; ms: number; reason?: string; /** seletores que o código procurou e não existem */ missing?: string[] };

function page(source: string, test: string) {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${THEME}html{background:var(--mm-bg);color:var(--mm-text);font-family:var(--mm-fonte)}body{margin:0}</style><script>${BEFORE}</script>`;
  const tail = `<script>${after(test || "")}</script>`;
  let code = source.replace(/^\s*<!doctype[^>]*>/i, "");
  const headTag = code.match(/<head(\s[^>]*)?>/i);
  if (headTag?.index !== undefined) code = code.slice(0, headTag.index + headTag[0].length) + head + code.slice(headTag.index + headTag[0].length);
  else code = `<head>${head}</head>${code}`;
  // O script do teste vai no fim do documento (depois dos scripts do artefato).
  const close = code.search(/<\/body>\s*(<\/html>)?\s*$/i);
  code = close >= 0 ? code.slice(0, close) + tail + code.slice(close) : code + tail;
  return `<!doctype html>${code}`;
}

/** Roda o artefato (e o teste, se houver) e diz o que aconteceu. Nunca lança: falha do próprio teste vira ran=false. */
export async function runArtifact(source: string, test: string, timeoutMs = 25_000): Promise<RuntimeReport> {
  const started = Date.now();
  const exe = browserPath();
  if (!exe) return { ran: false, ok: true, errors: [], failures: [], passed: 0, ms: 0, reason: "sem navegador no servidor" };
  const dir = await mkdtemp(path.join(tmpdir(), "mm-artefato-"));
  try {
    const file = path.join(dir, "artefato.html");
    const html = page(source, test);
    await writeFile(file, html, "utf8");
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--mute-audio",
      `--user-data-dir=${path.join(dir, "perfil")}`,
      "--window-size=420,900",
      "--virtual-time-budget=9000",
      "--dump-dom",
      `file:///${file.replace(/\\/g, "/")}`,
    ];
    const out = await new Promise<string>((resolve, reject) => {
      const child = spawn(exe, args, { windowsHide: true });
      let stdout = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", () => undefined);
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("o navegador demorou demais"));
      }, timeoutMs);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", () => {
        clearTimeout(timer);
        resolve(stdout);
      });
    });
    const m = out.match(/<pre id="__mm_resultado">([\s\S]*?)<\/pre>/);
    if (!m) return { ran: true, ok: false, errors: ["A página não terminou de carregar (o teste não chegou a rodar)."], failures: [], passed: 0, ms: Date.now() - started };
    const decoded = m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    const r = JSON.parse(decoded) as { erros: string[]; falhas: string[]; ok: number; nulos?: string[] };
    // Erro com a linha: junta o trecho de código daquela linha (a Kally vê exatamente onde quebrou).
    const lines = html.split("\n");
    const errors = r.erros
      .filter((e) => !/^ResizeObserver loop/.test(e))
      .map((e) => {
        const n = Number(e.match(/\(linha (\d+)\)/)?.[1]);
        const code = n && lines[n - 1] ? lines[n - 1].trim().slice(0, 160) : "";
        return code && code.length < 160 && !code.startsWith("<meta") ? `${e} → código: ${code}` : e;
      });
    return { ran: true, ok: !errors.length && !r.falhas.length, errors, failures: r.falhas, passed: r.ok, ms: Date.now() - started, missing: r.nulos ?? [] };
  } catch (cause) {
    return { ran: false, ok: true, errors: [], failures: [], passed: 0, ms: Date.now() - started, reason: cause instanceof Error ? cause.message : String(cause) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Bloco ```teste-artefato da resposta (o corpo da função de teste) e a resposta sem ele. */
export function takeTest(text: string): { test: string; rest: string } {
  const re = /\n?(`{3,})[ \t]*teste-artefato[^\n]*\n([\s\S]*?)\n\1[ \t]*(?=\n|$)/i;
  const m = text.match(re);
  if (!m) return { test: "", rest: text };
  return { test: m[2], rest: text.replace(m[0], "").replace(/\n{3,}/g, "\n\n").trimEnd() };
}
