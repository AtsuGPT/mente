// Estende o app.json. A exportação web (npm run export:web) é servida pelo próprio Next na
// raiz (minhamente.space/). EXPO_PUBLIC_WEB_BASE só é necessário para publicar o app em uma
// subpasta (ex.: "/algum-caminho"); sem ele, o app fica na raiz.
module.exports = ({ config }) => ({
  ...config,
  web: { ...config.web, output: "single" },
  experiments: { ...config.experiments, ...(process.env.EXPO_PUBLIC_WEB_BASE ? { baseUrl: process.env.EXPO_PUBLIC_WEB_BASE } : {}) },
});
