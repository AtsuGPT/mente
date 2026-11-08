import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

/**
 * A interface principal é o app web (Expo) exportado em public/ por "npm run export:web"
 * (em mobile/). É uma SPA: "/" e as rotas do app (/feed, /post/…) entregam public/index.html
 * e o roteador do app decide a tela. O Next continua servindo /api, /uploads e /convite.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: ["minhamente.space", "192.168.1.105", "192.168.1.108"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // A página do app muda a cada exportação; os arquivos em /_expo têm hash no nome.
      { source: "/", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
  // A query string é repassada automaticamente ao destino dos redirecionamentos.
  async redirects() {
    return [
      // Endereço antigo do app web (minhamente.space/app e subrotas).
      { source: "/app", destination: "/", permanent: true },
      { source: "/app/:path*", destination: "/:path*", permanent: true },
      // Endereços da primeira versão do site que não existem no app.
      { source: "/pensamento/:slug", destination: "/post/:slug", permanent: true },
      { source: "/pensamentos", destination: "/feed", permanent: true },
      { source: "/arquivo", destination: "/feed", permanent: true },
      { source: "/conversar", destination: "/perguntar", permanent: true },
      { source: "/entrar", destination: "/login", permanent: true },
      { source: "/admin", destination: "/", permanent: true },
      { source: "/admin/:path*", destination: "/", permanent: true },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [],
      // Sem página em "/": entrega o app.
      afterFiles: [{ source: "/", destination: "/index.html" }],
      // Rotas do app, só quando nenhuma página, rota ou arquivo do Next corresponde.
      // /api, /_next e /uploads ficam de fora para que um endereço inexistente dê 404 de verdade.
      fallback: [{ source: "/:path((?!(?:api|_next|uploads)(?:/|$)).+)", destination: "/index.html" }],
    };
  },
};

export default nextConfig;
