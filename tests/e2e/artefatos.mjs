// Artefatos antes/depois: o mesmo pedido aos dois sites; os quatro resultados passam pela mesma checagem visual (a nova,
// com sobreposição de rótulos e texto ilegível a 380 px) e por fotos num celular de 390 px.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const B = process.env.BENCH_DIR ?? "./bench";
const V = process.env.VISUAL_DIR ?? "./visual";
const PASS = readFileSync(`${B}/senha.txt`, "utf8").trim();
const SITES = { antes: "http://localhost:3211/api/mobile", depois: "http://localhost:3210/api/mobile" };
const ENV = "treinamento-kally";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(`${B}/shots`, { recursive: true });

const CASES = [
  { id: "encefalo", msg: "faz um encéfalo humano interativo para estudar neuroanatomia: os lobos com as funções de cada um, as estruturas internas (tálamo, hipotálamo, hipocampo, amígdala, cerebelo, tronco encefálico) e alternar entre vista lateral e corte sagital" },
  { id: "computador", msg: "cria um artefato mostrando a arquitetura de um computador: cada componente por dentro (CPU, memória, armazenamento, placa de vídeo, barramentos), podendo tocar em cada um para ver o interior e entender como os dados circulam" },
];

async function login(base) {
  const r = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "bench.kally", password: PASS }) });
  return (await r.json()).token;
}
async function ask(base, token, msg) {
  const t0 = Date.now();
  const r = await fetch(`${base}/env/${ENV}/kally`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ message: msg, history: [] }) });
  const raw = await r.text();
  let text = "", test = null;
  for (const block of raw.split("\n\n")) {
    if (!block.startsWith("data: ")) continue;
    const ev = JSON.parse(block.slice(6));
    if (typeof ev.text === "string") text += ev.text;
    if (typeof ev.replace === "string") text = ev.replace;
    if (ev.artifactTest !== undefined) test = ev.artifactTest;
  }
  return { text, test, ms: Date.now() - t0 };
}
function block(text) {
  const m = [...text.matchAll(/^(`{3,})artefato[ \t]*\n([\s\S]*?)\n\1[ \t]*$/gm)].pop();
  if (!m) return null;
  const lines = m[2].split("\n");
  const at = lines.findIndex((l) => /^\s*-{3,}\s*$/.test(l));
  return { title: m[2].match(/^\s*titulo\s*:\s*(.*)$/m)?.[1] ?? "Artefato", source: lines.slice(at + 1).join("\n") };
}
function check(source) {
  writeFileSync(`${V}/_alvo.html`, source);
  const out = execFileSync("C:/Users/satan/Downloads/minha-mente/node_modules/.bin/tsx.cmd", ["rodar-arquivo.mts", "_alvo.html"], { cwd: V, encoding: "utf8", shell: true, timeout: 120_000 });
  return JSON.parse(out.trim().split("\n").pop());
}
async function shot(token, id, site, b) {
  const r = await fetch(`${SITES.depois}/env/${ENV}/artefatos/exportar`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ formato: "html", source: b.source, title: b.title, format: "html" }) });
  const page = `${B}/shots/_${id}-${site}.html`;
  writeFileSync(page, await r.text());
  const host = `${B}/shots/_cel-${id}-${site}.html`;
  writeFileSync(host, `<!doctype html><html><body style="margin:0;background:#000"><iframe src="_${id}-${site}.html" style="width:390px;height:1500px;border:0;display:block"></iframe></body></html>`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=520,1500", "--force-device-scale-factor=1", "--virtual-time-budget=4000", "--allow-file-access-from-files", `--user-data-dir=${B}/_perfil`, `--screenshot=${B}/shots/${id}-${site}.png`, `file:///${host}`], { timeout: 60_000, stdio: "ignore" });
}

const tokens = { antes: await login(SITES.antes), depois: await login(SITES.depois) };
const res = {};
for (const c of CASES) {
  for (const site of ["antes", "depois"]) {
    const r = await ask(SITES[site], tokens[site], c.msg);
    const b = block(r.text);
    const visual = b ? check(b.source) : null;
    if (b) await shot(tokens.depois, c.id, site, b);
    res[`${c.id}-${site}`] = { ms: r.ms, linhas: b ? b.source.split("\n").length : 0, testeDaKally: r.test, checagemVisual: visual, three: b ? /three(\.min)?\.js/.test(b.source) : false, svg: b ? (b.source.match(/<path\b/g) ?? []).length : 0 };
    console.log(`${c.id.padEnd(11)} ${site.padEnd(6)} ${Math.round(r.ms / 1000)} s · ${res[`${c.id}-${site}`].linhas} linhas · teste da Kally ${r.test ? (r.test.ok ? "ok" : "falhou") : "-"} · checagem visual ${visual ? (visual.ok ? "ok" : "REPROVA: " + visual.failures.join(" | ").slice(0, 220)) : "sem artefato"} · paths ${res[`${c.id}-${site}`].svg}${res[`${c.id}-${site}`].three ? " · three.js" : ""}`);
    writeFileSync(`${B}/resultado-artefatos.json`, JSON.stringify(res, null, 2));
  }
}
