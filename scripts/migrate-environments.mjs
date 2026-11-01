// Migração para ambientes, sem apagar nada. Uso: node scripts/migrate-environments.mjs
//
// Pré-requisitos: o servidor Next parado (o SQLite não pode estar em uso) e o .env com DATABASE_URL.
// Passos:
//   1. cópia de segurança do arquivo do banco, ao lado dele;
//   2. fase A: tabelas e colunas novas, sem as chaves estrangeiras de ambiente
//      (os posts e categorias recebem environmentId = "mente" pelo valor padrão);
//   3. cria o ambiente "mente" (Minha Mente), se ainda não existir;
//   4. fase B: liga as chaves estrangeiras e gera o cliente Prisma;
//   5. confere que as contagens são as mesmas de antes.
// É idempotente: rodar de novo não duplica o ambiente nem altera dados.

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) throw new Error("DATABASE_URL precisa apontar para um arquivo SQLite (file:...).");

// O Prisma resolve "file:./x.db" a partir da pasta do schema; o schema da fase A fica em
// outra pasta, então todos os comandos recebem o caminho absoluto (senão criariam um banco vazio).
const rawPath = url.slice("file:".length).split("?")[0];
const dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(root, "prisma", rawPath);
if (!existsSync(dbPath)) throw new Error(`Banco não encontrado: ${dbPath}`);
for (const suffix of ["-journal", "-wal"]) {
  if (existsSync(dbPath + suffix)) throw new Error(`Há um ${suffix} ao lado do banco: pare o servidor antes de migrar.`);
}
const absoluteUrl = `file:${dbPath.replace(/\\/g, "/")}`;
process.env.DATABASE_URL = absoluteUrl;
console.log("Banco:", dbPath);

const prisma = (...args) => execFileSync(process.execPath, [prismaCli, ...args], { cwd: root, stdio: "inherit", env: process.env });

// Contagens num processo separado: no Windows o motor do Prisma fica travado enquanto
// o processo que o carregou existir, e isso impediria o "prisma generate" no fim.
function counts() {
  const clientPath = JSON.stringify(path.join(root, "src", "generated", "prisma"));
  const code = `const { PrismaClient } = require(${clientPath}); const db = new PrismaClient();
    Promise.all([db.post.count(), db.category.count(), db.$queryRawUnsafe('SELECT count(*) AS n FROM "_CategoryToPost"')])
      .then(([posts, categories, links]) => { console.log(JSON.stringify({ posts, categories, links: Number(links[0].n) })); return db.$disconnect(); });`;
  return JSON.parse(execFileSync(process.execPath, ["-e", code], { cwd: root, env: process.env, encoding: "utf8" }).trim());
}

const before = counts();
console.log("Antes:", before);

// 1. Cópia de segurança.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${dbPath}.antes-ambientes-${stamp}.bak`;
copyFileSync(dbPath, backup);
console.log("Cópia de segurança:", backup);

// 2. Fase A: o schema final sem as linhas marcadas "// fase-b".
const schemaPath = path.join(root, "prisma", "schema.prisma");
const finalSchema = readFileSync(schemaPath, "utf8");
const phaseA = finalSchema
  .split("\n")
  .filter((line) => !line.includes("// fase-b"))
  .join("\n")
  .replace('output   = "../src/generated/prisma"', `output   = "${path.join(root, "src", "generated", "prisma").replace(/\\/g, "/")}"`);
const tmp = mkdtempSync(path.join(tmpdir(), "mm-migracao-"));
const phaseAPath = path.join(tmp, "fase-a.prisma");
writeFileSync(phaseAPath, phaseA);
console.log("\nFase A (tabelas e colunas novas)...");
prisma("db", "push", "--schema", phaseAPath, "--skip-generate");

// 3. Ambiente original.
const sqlPath = path.join(tmp, "ambiente-mente.sql");
writeFileSync(
  sqlPath,
  `INSERT OR IGNORE INTO "Environment" ("id","slug","name","description","color","icon","guestAccess","createdAt","updatedAt")
   VALUES ('mente','minha-mente','Minha Mente','Um arquivo de pensamentos, ideias e fragmentos de uma mente em construção.','#7C5CE0','brain',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`,
);
console.log("\nCriando o ambiente \"mente\" (se não existir)...");
prisma("db", "execute", "--schema", phaseAPath, "--file", sqlPath);

// 4. Fase B: chaves estrangeiras + cliente.
console.log("\nFase B (chaves estrangeiras)...");
prisma("db", "push", "--skip-generate");
prisma("generate");

// 5. Conferência.
const after = counts();
console.log("\nDepois:", after);
const same = before.posts === after.posts && before.categories === after.categories && before.links === after.links;
if (!same) {
  console.error("As contagens mudaram! Restaure a cópia de segurança:", backup);
  process.exit(1);
}
console.log("Contagens idênticas. Migração concluída.");
