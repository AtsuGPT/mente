import Link from "next/link";
import { site } from "@/config/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-(--site-header) backdrop-blur-xl">
      <div className="mx-auto max-w-[44rem] px-4 sm:px-6">
        <div className="flex h-[4.25rem] items-center justify-between">
          <Link href="/" className="min-w-0 font-sans text-sm font-semibold" aria-label={`${site.name} — início`}>
            {site.name}
          </Link>
          <nav aria-label="Navegação" className="hidden items-center gap-5 sm:flex">
            <Link href="/" className="label transition-colors hover:text-fg">Início</Link>
            <Link href="/arquivo" className="label transition-colors hover:text-fg">Arquivo</Link>
            <Link href="/buscar" className="label transition-colors hover:text-fg">Buscar</Link>
            <Link href="/sobre" className="label transition-colors hover:text-fg">Sobre</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
