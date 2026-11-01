import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: ["minhamente.space", "192.168.1.105"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // App web (Expo exportado em public/app por "npm run export:web" em mobile/): é uma SPA,
  // então rotas como /app/feed caem no index.html — só quando não há arquivo com esse nome.
  async rewrites() {
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: "/app/:path*", destination: "/app/index.html" }] };
  },
};

export default nextConfig;
