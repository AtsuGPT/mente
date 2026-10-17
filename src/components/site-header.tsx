import Link from "next/link";
import { site } from "@/config/site";
import { ProfileAvatar } from "./profile-avatar";

export function SiteHeader({ profileImage }: { profileImage: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-(--site-header) backdrop-blur-xl">
      <div className="mx-auto max-w-[44rem] px-4 sm:px-6">
        <div className="flex h-[4.25rem] items-center justify-between">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${site.name} — início`}>
            <ProfileAvatar size={38} src={profileImage} />
            <span className="min-w-0 leading-tight">
              <span className="block font-sans text-sm font-semibold">{site.author}</span>
              <span className="block font-sans text-xs text-muted">{site.authorHandle}</span>
            </span>
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
