// Junta as notas (dadas às cegas, por letra) com a chave e os tempos medidos.
//   node eval/kally/juntar.js <pasta com respostas.json, chave.json, notas.json e checagens.json>
// notas.json: { "<caso>": { "<letra>": { fidelidade, profundidade, coerencia, precisao, clareza, geral, nota } } } (0 a 5)
const fs = require("fs");
const path = require("path");
const dir = process.argv[2];
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const respostas = read("respostas.json"), chave = read("chave.json"), notas = read("notas.json"), checagens = read("checagens.json");
const { casos } = require("./casos.json");
const CRITERIOS = ["fidelidade", "profundidade", "coerencia", "precisao", "clareza", "geral"];
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

const linhas = [];
for (const [caso, porLetra] of Object.entries(notas)) {
  for (const [letra, n] of Object.entries(porLetra)) {
    const config = chave[caso][letra];
    const r = respostas.find((x) => x.caso === caso && x.config === config);
    const c = checagens.find((x) => x.caso === caso && x.config === config);
    const tipo = casos.find((x) => x.id === caso).tipo;
    const competencia = casos.find((x) => x.id === caso).competencia;
    linhas.push({ caso, tipo, competencia, config, ...n, segundos: r.segundos, primeiroTexto: r.primeiroTexto, tokens: r.stats?.outputTokens ?? null, tps: r.stats?.tokensPerSecond ?? null, trocas: r.stats?.pipeline?.swapSeconds ?? 0, interpretado: !!r.stats?.pipeline?.interpreted, memoria: r.stats?.memory ?? null, links: c?.links ?? 0, cortado: !!c?.cortado, pontos: c?.pontos ?? null });
  }
}
fs.writeFileSync(path.join(dir, "linhas.json"), JSON.stringify(linhas, null, 2));

function resumo(filtro, rotulo) {
  const grupos = {};
  for (const l of linhas.filter(filtro)) (grupos[l.config] ??= []).push(l);
  console.log(`\n${rotulo}`);
  for (const [config, ls] of Object.entries(grupos)) {
    const notasTxt = CRITERIOS.map((k) => `${k.slice(0, 5)} ${avg(ls.map((l) => l[k]))}`).join(" · ");
    console.log(`  ${config.padEnd(10)} n=${String(ls.length).padStart(2)} | ${notasTxt} | 1º texto mediana ${median(ls.map((l) => l.primeiroTexto))}s · total mediana ${median(ls.map((l) => l.segundos))}s · ${avg(ls.map((l) => l.tps).filter(Boolean))} tok/s · links ${ls.reduce((a, l) => a + l.links, 0)} · cortados ${ls.filter((l) => l.cortado).length}`);
  }
}
resumo((l) => l.tipo === "longo", "Casos longos (todas as configurações com interpretador ou não)");
resumo((l) => l.tipo === "curto", "Casos curtos (sem interpretador)");
resumo((l) => l.tipo === "documento", "Casos com base de documentos");
for (const comp of ["estudo", "post", "analise"]) resumo((l) => l.competencia === comp, `Competência ${comp}`);
resumo(() => true, "Todos os casos");
