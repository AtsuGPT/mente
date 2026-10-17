import type { Metadata, Viewport } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource-variable/instrument-sans/wght.css";
import "./globals.css";
import { site } from "@/config/site";
import { siteUrl } from "@/lib/env";

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
  twitter: { card: "summary_large_image", title: site.name, description: site.tagline },
};

export const viewport: Viewport = {
  themeColor: "#080808",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-fg focus:px-3 focus:py-2 focus:font-sans focus:text-sm focus:text-bg"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
