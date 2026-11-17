// Memória de aprendizagem de ponta a ponta no site novo (3210): explicação numa conversa salva, dois quizzes, a rota de
// progresso, "o que eu já estudei?" e o isolamento entre contas.
import { readFileSync } from "node:fs";
const B = process.env.BENCH_DIR ?? "./bench";
const PASS = readFileSync(`${B}/senha.txt`, "utf8").trim();
const BASE = "http://localhost:3210/api/mobile";
const ENV = "treinamento-kally";
const ok = (cond, what) => console.log(`${cond ? "✓" : "✗"} ${what}`);

async function login(u) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: u, password: PASS }) });
  return (await r.json()).token;
}
async function kally(token, body) {
  const r = await fetch(`${BASE}/env/${ENV}/kally`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const raw = await r.text();
  let text = "", conversationId = null;
  for (const block of raw.split("\n\n")) {
    if (!block.startsWith("data: ")) continue;
    const ev = JSON.parse(block.slice(6));
    if (typeof ev.text === "string") text += ev.text;
    if (typeof ev.replace === "string") text = ev.replace;
    if (ev.conversationId) conversationId = ev.conversationId;
  }
  return { text, conversationId };
}
const progress = async (token) => (await (await fetch(`${BASE}/env/${ENV}/kally/progresso`, { headers: { authorization: `Bearer ${token}` } })).json()).topics ?? [];

const a = await login("bench.kally");
const b = await login("bench.kally2");
await fetch(`${BASE}/env/${ENV}/kally/progresso`, { method: "DELETE", headers: { authorization: `Bearer ${a}` } });

// 1) Conversa salva: uma explicação conta como progresso, não como domínio.
const first = await kally(a, { message: "me explica a lei de Ohm", save: true });
ok(!!first.conversationId, `conversa salva criada`);
let topics = await progress(a);
const ohm = () => topics.find((t) => /ohm/i.test(t.title));
ok(ohm() && ohm().explanations === 1 && ohm().mastery === "estudando", `explicação registrada como progresso (${JSON.stringify(ohm() && { t: ohm().title, e: ohm().explanations, m: ohm().mastery })})`);

// 2) Dois quizzes com o resultado estruturado (como o app manda): só agora vira domínio.
const quiz = { tema: "Lei de Ohm", total: 4, correct: 4, wrong: [] };
await kally(a, { message: "Fiz o quiz e acertei todas as 4. Quero um desafio um pouco mais difícil.", conversationId: first.conversationId, quizResult: quiz });
topics = await progress(a);
ok(ohm()?.quizzes === 1 && ohm()?.mastery === "estudando", `um quiz perfeito ainda não é domínio (${ohm()?.mastery})`);
await kally(a, { message: "Fiz o quiz e acertei 3 de 4. Errei: \"Resistência em paralelo\". Me explica o que eu errei?", conversationId: first.conversationId, quizResult: { tema: "Lei de Ohm", total: 4, correct: 3, wrong: ["Resistência em paralelo"] } });
topics = await progress(a);
ok(ohm()?.quizzes === 2 && ohm()?.correct === 7 && ohm()?.questions === 8 && ohm()?.mastery === "estudando" && ohm()?.weakPoints?.includes("Resistência em paralelo"), `dois quizzes, 7 de 8, último 75% → continua estudando (domínio exige o último ≥ 80%) e o erro vira ponto fraco (${ohm()?.mastery}, ${JSON.stringify(ohm()?.weakPoints)})`);
ok(ohm()?.title === "Lei de Ohm", `nome do assunto: ${ohm()?.title}`);

// 3) "o que eu já estudei?": o cartão de progresso vem com os dados do banco.
const asked = await kally(a, { message: "o que eu já estudei até agora?", conversationId: first.conversationId });
ok(/```progresso[\s\S]*Lei de Ohm/i.test(asked.text), `cartão de progresso na resposta`);

// 4) Isolamento: a outra conta não vê nada.
ok((await progress(b)).length === 0, `outra conta no mesmo ambiente não vê o progresso`);
const other = await kally(b, { message: "o que eu já estudei até agora?" });
ok(!/Lei de Ohm/i.test(other.text), `outra conta não recebe o progresso da primeira na resposta`);
process.exit(0);
