import type { Metadata, Viewport } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/instrument-sans/wght.css";
import "./globals.css";
import { site } from "@/config/site";
import { siteUrl } from "@/lib/env";

/**
 * Layout das poucas páginas renderizadas pelo Next (convite, 404, erro). A interface
 * principal é o app web exportado do Expo e servido em "/" (ver next.config.ts).
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: site.name, template: `%s — ${site.name}` },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    siteName: site.name,
    locale: site.locale,
    type: "website",
    title: site.name,
    description: site.tagline,
  },
};

export const viewport: Viewport = {
  themeColor: "#07060B",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
