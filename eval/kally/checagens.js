// Checagens automáticas das respostas (complementam as notas da rubrica, não as substituem).
//   node eval/kally/checagens.js <pasta com respostas.json>
const fs = require("fs");
const path = require("path");
const dir = process.argv[2];
const respostas = JSON.parse(fs.readFileSync(path.join(dir, "respostas.json"), "utf8"));

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// Pontos da própria pessoa que um post fiel precisa conter (posts) e as dez bases da LGPD (D1).
const PONTOS = {
  B1: ["um ano", "beb", "socia", "festa", "maos", "cedo", "bar", "convers"],
  B2: ["dois anos", "alzheimer", "nome", "music", "canta", "sorri", "memoria afetiva", "ajuda"],
  B3: ["o que ama", "fotograf", "dinheiro", "prazer", "emprego", "hobby"],
  B5: ["burnout", "dizer nao", "culpad", "ninguem morreu", "melhor"],
  D3: ["marco", "ansiedade", "5 minutos", "caminhada", "5 km", "junho", "chorei", "aos poucos", "manha", "silencio"],
  D1: ["consentimento", "obrigacao legal", "politicas publicas", "pesquisa", "contrato", "exercicio regular", "incolumidade|protecao da vida", "tutela da saude", "legitimo interesse", "protecao do credito"],
};

const rows = respostas.map((r) => {
  const t = r.texto || "";
  const n = norm(t);
  const pontos = PONTOS[r.caso] ? PONTOS[r.caso].filter((p) => p.split("|").some((alt) => n.includes(alt))).length : null;
  return {
    caso: r.caso,
    config: r.config,
    caracteres: t.length,
    links: (t.match(/https?:\/\/\S+/g) || []).length,
    saudacao: /^\s*(bom dia|boa tarde|boa noite|ola|oi)\b/i.test(norm(t)),
    // Termina sem pontuação, emoji ou item de lista: provável corte no limite de tokens.
    cortado: t.length > 200 && !/[.!?…)"”*`>\]\p{Extended_Pictographic}]\s*$/u.test(t.trim()) && !/\n\s*([-*•]|#+) [^\n]+$/.test(t.trim()),
    rascunho: /<rascunho>/i.test(t),
    fontesBase: (r.sources || []).filter((s) => s.kind === "documento" || s.kind === "referencia").length,
    fontesAmbiente: (r.sources || []).filter((s) => ["post", "projeto", "rascunho", "conversa"].includes(s.kind)).length,
    pontos: pontos === null ? null : `${pontos}/${PONTOS[r.caso].length}`,
    erro: r.erro || null,
  };
});
fs.writeFileSync(path.join(dir, "checagens.json"), JSON.stringify(rows, null, 2));
for (const r of rows) {
  const flags = [r.links ? `${r.links} link(s)` : "", r.saudacao ? "saudação" : "", r.cortado ? "CORTADO" : "", r.erro ? `ERRO ${r.erro}` : ""].filter(Boolean).join(", ");
  console.log(`${r.caso} ${r.config.padEnd(10)} ${String(r.caracteres).padStart(5)} car. · base ${r.fontesBase} · ambiente ${r.fontesAmbiente}${r.pontos ? ` · pontos ${r.pontos}` : ""}${r.rascunho ? " · rascunho" : ""}${flags ? ` · ${flags}` : ""}`);
}
