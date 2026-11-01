// Estende o app.json. Só a exportação web publicada usa EXPO_PUBLIC_WEB_BASE (ex.: "/app"):
// o app fica em minhamente.space/app, servido pelo próprio Next (ver "export:web").
module.exports = ({ config }) => ({
  ...config,
  web: { ...config.web, output: "single" },
  experiments: { ...config.experiments, ...(process.env.EXPO_PUBLIC_WEB_BASE ? { baseUrl: process.env.EXPO_PUBLIC_WEB_BASE } : {}) },
});
