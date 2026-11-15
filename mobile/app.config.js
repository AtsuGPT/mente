// Estende o app.json. A exportação web (npm run export:web) é servida pelo próprio Next na
// raiz (minhamente.space/). EXPO_PUBLIC_WEB_BASE só é necessário para publicar o app em uma
// subpasta (ex.: "/algum-caminho"); sem ele, o app fica na raiz.
module.exports = ({ config }) => ({
  ...config,
  web: { ...config.web, output: "single" },
  // Link fixo no Expo Go (EAS Update): cada publicação manda o app para o Expo, e o Expo Go abre a versão mais nova pelo
  // mesmo link, sem depender do túnel do PC. O Expo Go só aceita atualizações marcadas com a versão do SDK.
  runtimeVersion: { policy: "sdkVersion" },
  updates: { ...config.updates, url: `https://u.expo.dev/${config.extra?.eas?.projectId}` },
  experiments: { ...config.experiments, ...(process.env.EXPO_PUBLIC_WEB_BASE ? { baseUrl: process.env.EXPO_PUBLIC_WEB_BASE } : {}) },
});
