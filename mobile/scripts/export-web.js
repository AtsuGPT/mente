// Exporta a versão web do app para ../public, servida pelo Next na raiz (minhamente.space/).
// Uso: npm run export:web   (o app usa a origem da própria página como endereço da API)
//
// O "expo export" apaga a pasta de saída inteira, então a exportação vai para dist-web/
// e só depois é copiada para ../public, substituindo apenas o que a exportação anterior
// gerou (lista em ../public/.export-web.json). O resto de public/ não é tocado.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const mobileDir = path.join(__dirname, "..");
const stagingDir = path.join(mobileDir, "dist-web");
const publicDir = path.join(mobileDir, "..", "public");
const manifestPath = path.join(publicDir, ".export-web.json");
// Pasta da exportação antiga, quando o app era servido em /app.
const legacyDir = path.join(publicDir, "app");

// O app web conversa com o backend que o serviu (mesma origem), seja qual for o endereço.
const env = { ...process.env, EXPO_PUBLIC_WEB_SAME_ORIGIN: "1" };
delete env.EXPO_PUBLIC_WEB_BASE;

const cli = path.join(mobileDir, "node_modules", "expo", "bin", "cli");
execFileSync(process.execPath, [cli, "export", "-p", "web", "--output-dir", stagingDir, "--clear"], { stdio: "inherit", env, cwd: mobileDir });

fs.mkdirSync(publicDir, { recursive: true });
const exported = fs.readdirSync(stagingDir);
let previous = [];
try {
  previous = JSON.parse(fs.readFileSync(manifestPath, "utf8")).entries ?? [];
} catch {
  // Primeira exportação na raiz.
}
for (const entry of new Set([...previous, ...exported])) {
  if (entry.includes("/") || entry.includes("\\") || entry.startsWith(".")) continue;
  fs.rmSync(path.join(publicDir, entry), { recursive: true, force: true });
}
fs.rmSync(legacyDir, { recursive: true, force: true });
for (const entry of exported) fs.cpSync(path.join(stagingDir, entry), path.join(publicDir, entry), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify({ exportedAt: new Date().toISOString(), entries: exported }, null, 2) + "\n");
fs.rmSync(stagingDir, { recursive: true, force: true });
console.log(`App web copiado para ${path.relative(process.cwd(), publicDir) || "."}: ${exported.join(", ")}`);
