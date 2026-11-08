// Semeia um banco LOCAL de teste com as contas, os ambientes, as pastas e as conversas salvas de uma rodada da
// simulação, para comparar versões da Kally sobre o mesmo conteúdo (teste A/B). Nunca aponte para o banco real.
//
//   DATABASE_URL="file:/caminho/teste.db" npx tsx eval/simulacao/semear-local.ts <rodada> <estado-local.json> <api-local>
//
// Depois: SIM_ESTADO=<estado-local.json> node eval/simulacao/simular.mjs replicar <rodada>   (posts e documentos)
//         SIM_ESTADO=<estado-local.json> SIM_SAIDA=<pasta> node eval/simulacao/simular.mjs prova <rodada>
// As contas são criadas direto no banco de teste (o cadastro pela API tem limite por IP).
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../../src/generated/prisma";

const here = path.dirname(fileURLToPath(import.meta.url));
const [roundArg, stateFile, api] = process.argv.slice(2);
if (!roundArg || !stateFile || !api) throw new Error("Uso: semear-local.ts <rodada> <estado-local.json> <api-local>");
if (!/^file:/.test(process.env.DATABASE_URL ?? "") || /mente\.db/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use um DATABASE_URL de teste (file:...), nunca o banco real.");
const n = Number(roundArg);
const pad = (x: number) => String(x).padStart(2, "0");
const read = (f: string) => JSON.parse(fs.readFileSync(f, "utf8"));
const { ambiente, personas } = read(path.join(here, "personas.json"));
const plan = read(path.join(here, "rodadas", `rodada-${pad(n)}.json`)).acoes;
const recs = read(path.join(here, "resultados", `rodada-${pad(n)}`, "acoes.json"));

const hash = (password: string) => {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", 16384, 8, 1, salt.toString("base64url"), derived.toString("base64url")].join(":");
};
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const db = new PrismaClient();
const state: Record<string, any> = { api, personas: {}, posts: {}, fontes: {}, conversas: {}, documentos: {} };

async function user(usuario: string, nome: string) {
  const senha = randomBytes(12).toString("base64url");
  const u = await db.user.upsert({ where: { username: usuario }, update: { passwordHash: hash(senha), displayName: nome }, create: { username: usuario, displayName: nome, passwordHash: hash(senha) } });
  return { usuario, senha, userId: u.id, membro: true };
}

async function main() {
  state.coord = await user("treinamento.kally", "Coordenação do Treinamento");
  const main = await db.environment.create({ data: { slug: `treinamento-kally-${Date.now().toString(36)}`, name: ambiente.nome, description: ambiente.descricao, color: ambiente.cor, icon: ambiente.icone, ownerId: state.coord.userId, members: { create: { userId: state.coord.userId, role: "OWNER" } } } });
  const control = await db.environment.create({ data: { slug: `${main.slug}-controle`, name: `${ambiente.nome} (controle)`, color: "#8A8A8A", icon: ambiente.icone, ownerId: state.coord.userId, members: { create: { userId: state.coord.userId, role: "OWNER" } } } });
  state.ambiente = { id: main.id, slug: main.slug };
  state.controle = { id: control.id, slug: control.slug };
  state.pastas = {};
  for (const [i, p] of [...ambiente.pastas, { nome: "Guia", cor: "#5C5C5C", descricao: "Regras e orientações do ambiente." }].entries()) {
    const c = await db.category.create({ data: { environmentId: main.id, name: p.nome, slug: slugify(p.nome), description: p.descricao, color: p.cor, position: i } });
    state.pastas[p.nome] = c.id;
  }
  for (const p of personas) {
    state.personas[p.id] = await user(p.usuario, p.nome);
    await db.membership.create({ data: { environmentId: main.id, userId: state.personas[p.id].userId, role: "MEMBER" } });
  }
  // Conversas salvas da rodada, com as mesmas mensagens (alimentam a memória só da própria pessoa).
  for (const a of plan.filter((x: any) => x.conversa)) {
    const rec = recs.find((r: any) => r.id === a.id);
    if (!rec?.turnos) continue;
    state.conversas[a.quem] ??= {};
    let id = state.conversas[a.quem][a.conversa];
    if (!id) {
      const conv = await db.kallyConversation.create({ data: { environmentId: main.id, userId: state.personas[a.quem].userId, mode: "chat", title: a.mensagem.slice(0, 80) } });
      id = state.conversas[a.quem][a.conversa] = conv.id;
    }
    for (const t of rec.turnos) {
      await db.kallyMessage.create({ data: { conversationId: id, role: "user", content: t.mensagem } });
      if (t.texto) await db.kallyMessage.create({ data: { conversationId: id, role: "assistant", content: t.texto } });
    }
    for (const f of a.fatos ?? []) state.fontes[f] = { tipo: "conversa", id };
  }
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(`Semeado: ambiente ${main.slug}, controle ${control.slug}, ${personas.length} personas, ${Object.values(state.conversas).reduce((a: number, c: any) => a + Object.keys(c).length, 0)} conversas. Estado em ${stateFile}`);
  await db.$disconnect();
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
