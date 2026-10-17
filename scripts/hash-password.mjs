// Gera o hash da senha do administrador (scrypt, sem dependências extras).
// Uso: npm run admin:hash            (pede a senha sem exibi-la)
//      npm run admin:hash -- "senha" (menos seguro: fica no histórico do shell)
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function hash(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  // Formato sem "$" para não ser interpolado pelo carregador de .env.
  return ["scrypt", N, R, P, salt.toString("base64url"), derived.toString("base64url")].join(":");
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => {
      if (s.includes(question)) write.call(rl, s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const fromArg = process.argv[2];
const password = fromArg ?? (await promptHidden("Nova senha (mín. 4 caracteres): "));

if (!password || password.length < 4) {
  console.error("A senha precisa ter pelo menos 4 caracteres.");
  process.exit(1);
}

console.log(`ADMIN_PASSWORD_HASH="${hash(password)}"`);
