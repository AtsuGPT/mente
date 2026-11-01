// Metro (empacotador do React Native) com acesso aos módulos puros do backend.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// "@shared/*" e "@content/*" (tsconfig.json) apontam para ../src/lib e ../src/content:
// slug, texto, datas, cores e o texto "Sobre", sem dependências de navegador ou de servidor.
// Só estas pastas são observadas.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, "../src/lib"),
  path.resolve(__dirname, "../src/content"),
];

module.exports = config;
