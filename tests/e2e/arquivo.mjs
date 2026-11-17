// Exportação sem modelo: "transforma isso em PDF" com um documento já na conversa → o servidor gera o PDF, manda a
// referência (evento file) e só quem pediu baixa (rota /kally/arquivos/[id]). Não gasta créditos.
import { readFileSync } from "node:fs";
const B = process.env.BENCH_DIR ?? "./bench";
const PASS = readFileSync(`${B}/senha.txt`, "utf8").trim();
const BASE = "http://localhost:3210/api/mobile";
const ENV = "treinamento-kally";
const ok = (cond, what) => console.log(`${cond ? "✓" : "✗"} ${what}`);
const login = async (u) => (await (await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: u, password: PASS }) })).json()).token;

const doc = "# Lei de Ohm — resumo\n\nA tensão (U), a corrente (i) e a resistência (R) se relacionam por **U = R · i**. Ação, coração, ênfase: acentos têm que sair certos.\n\n| Grandeza | Unidade | Símbolo |\n| --- | --- | --- |\n| Tensão | volt | V |\n| Corrente | ampère | A |\n| Resistência | ohm | Ω |\n\n```js\nconst corrente = (u, r) => u / r; // 12 V em 20 Ω → 0,6 A\n```\n\n## Exemplo\n\nUm chuveiro de 220 V com resistência de 11 Ω puxa 20 A.\n";
const a = await login("bench.kally");
const t0 = Date.now();
const r = await fetch(`${BASE}/env/${ENV}/kally`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${a}` }, body: JSON.stringify({ message: "transforma isso em PDF", history: [], artifact: { title: "Lei de Ohm — resumo", kind: "documento", format: "markdown", source: doc } }) });
let text = "", file = null;
for (const block of (await r.text()).split("\n\n")) {
  if (!block.startsWith("data: ")) continue;
  const ev = JSON.parse(block.slice(6));
  if (typeof ev.text === "string") text += ev.text;
  if (ev.file) file = ev.file;
}
ok(!!file, `evento file recebido em ${Date.now() - t0} ms (${JSON.stringify(file)})`);
ok(/Arquivo pronto/.test(text) && !/n[aã]o consegui/i.test(text), `texto anuncia o arquivo só depois de pronto: ${text.slice(0, 120)}`);
if (file) {
  const dl = await fetch(`${BASE}/env/${ENV}/kally/arquivos/${file.id}`, { headers: { authorization: `Bearer ${a}` } });
  const bytes = Buffer.from(await dl.arrayBuffer());
  ok(dl.ok && bytes.subarray(0, 5).toString() === "%PDF-", `download é um PDF (${bytes.length} bytes, ${file.pages} página(s))`);
  ok(/filename\*=UTF-8''/.test(dl.headers.get("content-disposition") ?? ""), `nome do arquivo (sem acento, pela regra de nomes de export.ts): ${decodeURIComponent((dl.headers.get("content-disposition") ?? "").split("''")[1] ?? "")}`);
  const b = await login("bench.kally2");
  const other = await fetch(`${BASE}/env/${ENV}/kally/arquivos/${file.id}`, { headers: { authorization: `Bearer ${b}` } });
  ok(other.status === 404, `outra conta não baixa o arquivo (${other.status})`);
  const anon = await fetch(`${BASE}/env/${ENV}/kally/arquivos/${file.id}`);
  ok(anon.status === 401, `sem login não baixa (${anon.status})`);
}
process.exit(0);
