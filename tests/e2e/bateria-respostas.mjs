// Bateria antes/depois: os mesmos pedidos ao site antigo (3211, main 1f74a0c) e ao novo (3210, branch kally-intelligence),
// um de cada vez, alternando. Guarda o texto, o tempo até o 1º texto e o total; as métricas do servidor (interpretador,
// modelo, tokens) saem do registro "Kally perf" de cada site.
import { readFileSync, writeFileSync } from "node:fs";
const B = process.env.BENCH_DIR ?? "./bench";
const PASS = readFileSync(`${B}/senha.txt`, "utf8").trim();
const SITES = { antes: "http://localhost:3211/api/mobile", depois: "http://localhost:3210/api/mobile" };
const ENV = "treinamento-kally";

const RECURSAO = [
  { role: "user", content: "me explica recursão" },
  { role: "assistant", content: "Recursão é quando uma função chama a si mesma para resolver uma versão menor do mesmo problema. Toda função recursiva precisa de um caso base, que para a recursão, e de um passo recursivo, que se aproxima do caso base. Exemplo: fatorial(n) = n × fatorial(n − 1), com fatorial(0) = 1. Cada chamada fica guardada na pilha de chamadas até o caso base ser alcançado; então os resultados voltam multiplicando, de dentro para fora." },
];
const CODIGO = [
  { role: "user", content: "por que isso retorna null? const el = document.getElementById('menu'); el.classList.add('aberto')" },
  { role: "assistant", content: "O getElementById devolve null quando o elemento ainda não existe no momento em que o script roda. Coloque o <script> no fim do <body> ou rode o código dentro de document.addEventListener('DOMContentLoaded', ...)." },
];
const IDEIA = [
  { role: "user", content: "tava pensando que estudar de manhã cedo rende mais pra mim porque a casa tá em silêncio e eu ainda não abri o celular, e quando eu deixo pra noite eu fico rolando o feed e não faço nada" },
  { role: "assistant", content: "Faz sentido: de manhã você tira as duas maiores fontes de interrupção (barulho e notificações) antes de elas aparecerem. À noite, o celular já está aberto e o cansaço deixa o feed muito mais tentador." },
];

export const CASES = [
  { id: "casual-oi", cat: "casual", msg: "Oi, tudo bem?" },
  { id: "relato-programar", cat: "casual", msg: "Aprendi a programar hoje!" },
  { id: "casual-valeu", cat: "casual", msg: "valeu, ajudou demais", history: RECURSAO },
  { id: "ctx-nao-entendi", cat: "contexto", msg: "Não entendi essa parte da pilha", history: RECURSAO },
  { id: "ctx-null", cat: "contexto", msg: "Meu código continua retornando null", history: CODIGO },
  { id: "ctx-publicavel", cat: "contexto", msg: "Transforma aquela ideia em algo publicável", history: IDEIA },
  { id: "ensino-sistema", cat: "ensino", msg: "Quero entender como o sistema imunológico funciona" },
  { id: "ensino-freud", cat: "ensino", msg: "me explica o que é inconsciente pra Freud" },
  { id: "ensino-mitose", cat: "ensino", msg: "qual a diferença entre mitose e meiose?" },
  { id: "pergunta-entropia", cat: "ensino", msg: "o que é entropia?" },
  { id: "code-dedupe", cat: "programacao", msg: "escreve uma função em javascript que remove itens duplicados de um array mantendo a ordem original" },
  { id: "code-wat", cat: "programacao", msg: "por que [] == ![] dá true em javascript?" },
  { id: "conta-integral", cat: "conta", msg: "calcula a integral de x·sen(x) de 0 a π" },
  { id: "conta-capacitor", cat: "conta", msg: "um capacitor de 100 µF carregado a 12 V descarrega por um resistor de 10 kΩ: qual a tensão nele depois de 2 s?" },
  { id: "orient-anatomia", cat: "orientacao", msg: "monta um plano de estudos de 2 semanas pra prova de anatomia do sistema nervoso" },
  { id: "orient-estatistica", cat: "orientacao", msg: "por onde eu começo a estudar estatística?" },
  { id: "analise-argumento", cat: "analise", msg: "analise esse argumento: todo mundo que estuda passa; eu passei; logo, eu estudei" },
  { id: "post-celular", cat: "post", msg: "quero fazer um post sobre como foi largar o celular por uma semana: fiquei ansioso no começo, depois dormi melhor e li dois livros" },
  { id: "quiz-ohm", cat: "prova", msg: "me faz um quiz de 4 questões sobre lei de Ohm" },
  { id: "progresso", cat: "memoria", msg: "o que eu já estudei até agora?" },
];

async function login(base) {
  const r = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "bench.kally", password: PASS }) });
  const j = await r.json();
  if (!j.token) throw new Error(`login falhou em ${base}: ${JSON.stringify(j).slice(0, 120)}`);
  return j.token;
}

async function ask(base, token, c) {
  const t0 = Date.now();
  const r = await fetch(`${base}/env/${ENV}/kally`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ message: c.msg, history: c.history ?? [] }) });
  if (!r.ok) return { erro: `${r.status} ${(await r.text()).slice(0, 200)}`, text: "", ms: Date.now() - t0 };
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", first = null;
  const out = { status: [], files: [] };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (!chunk.startsWith("data: ")) continue;
      const ev = JSON.parse(chunk.slice(6));
      if (typeof ev.text === "string") { if (first === null && ev.text.trim()) first = Date.now() - t0; text += ev.text; }
      if (typeof ev.replace === "string") text = ev.replace;
      if (ev.status) out.status.push(ev.status);
      if (ev.mode) out.mode = ev.mode;
      if (ev.file) out.files.push(ev.file);
      if (ev.error) out.error = ev.error;
    }
  }
  return { ...out, text, ms: Date.now() - t0, firstMs: first, startedAt: new Date(t0).toISOString() };
}

const only = process.argv.slice(2);
const tokens = process.env.SO ? { [process.env.SO]: await login(SITES[process.env.SO]) } : { antes: await login(SITES.antes), depois: await login(SITES.depois) };
const res = [];
for (const c of CASES) {
  if (only.length && !only.includes(c.id)) continue;
  const row = { ...c, history: undefined, hadHistory: !!c.history };
  for (const site of (process.env.SO ? [process.env.SO] : ["antes", "depois"])) {
    row[site] = await ask(SITES[site], tokens[site], c);
    console.log(`${c.id.padEnd(20)} ${site.padEnd(6)} ${String(Math.round(row[site].ms / 1000)).padStart(4)} s  1º texto ${row[site].firstMs ? Math.round(row[site].firstMs / 1000) + " s" : "—"}  ${row[site].text.length} car.${row[site].erro || row[site].error ? "  ERRO " + (row[site].erro || row[site].error) : ""}`);
  }
  res.push(row);
  writeFileSync(`${B}/${process.env.SAIDA ?? "resultado-respostas.json"}`, JSON.stringify(res, null, 2));
}
console.log("fim");
