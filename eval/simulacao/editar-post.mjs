// Edita um post da simulação como a própria autora (ex.: a Sônia tirando do post os dados que a Kally copiou do
// documento pessoal dela). Registra a edição em resultados/manutencao.json.
//   node eval/simulacao/editar-post.mjs <id da ação que publicou o post> <arquivo com o novo texto> <pasta>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [acao, arquivo, pasta] = process.argv.slice(2);
const stateFile = path.resolve(process.env.SIM_ESTADO || path.join(here, ".estado.json"));
const s = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const post = s.posts[acao];
if (!post) throw new Error(`Post da ação ${acao} não encontrado no estado.`);
const autor = post.autor === "coord" ? s.coord : s.personas[post.autor];
const login = await fetch(`${s.api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: autor.usuario, password: autor.senha }) }).then((r) => r.json());
const content = fs.readFileSync(arquivo, "utf8").trim();
const form = new FormData();
form.append("title", post.titulo);
form.append("slug", post.slug ?? "");
form.append("content", content);
form.append("intent", "publish");
if (s.pastas[pasta]) form.append("categoryIds", s.pastas[pasta]);
const r = await fetch(`${s.api}/env/${s.ambiente.slug}/manage/posts/${post.id}`, { method: "PUT", headers: { Authorization: `Bearer ${login.token}` }, body: form });
const body = await r.json().catch(() => ({}));
if (!r.ok) throw new Error(`Edição falhou (${r.status}): ${JSON.stringify(body).slice(0, 300)}`);
const logFile = path.join(path.resolve(process.env.SIM_SAIDA || path.join(here, "resultados")), "manutencao.json");
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf8")) : [];
log.push({ data: new Date().toISOString(), acao, postId: post.id, autor: post.autor, arquivo: path.relative(path.resolve(here, "../.."), path.resolve(arquivo)), motivo: process.env.MOTIVO ?? "" });
fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
console.log(`Post "${post.titulo}" editado por ${autor.usuario}.`);
