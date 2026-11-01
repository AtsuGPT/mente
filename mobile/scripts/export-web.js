// Exporta a versão web do app para ../public/app, servida pelo Next em minhamente.space/app.
// Uso: npm run export:web   (EXPO_PUBLIC_API_URL pode ser trocado no ambiente)
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const env = {
  ...process.env,
  EXPO_PUBLIC_WEB_BASE: "/app",
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || "https://minhamente.space",
};
const cli = path.join(__dirname, "..", "node_modules", "expo", "bin", "cli");
execFileSync(process.execPath, [cli, "export", "-p", "web", "--output-dir", path.join("..", "public", "app"), "--clear"], { stdio: "inherit", env, cwd: path.join(__dirname, "..") });
