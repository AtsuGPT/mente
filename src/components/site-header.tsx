import Link from "next/link";
import { accentVars } from "@/lib/color";
import type { CategorySummary } from "@/server/categories";
import { site } from "@/config/site";
import { NavLink } from "./nav-link";
import { ProfileAvatar } from "./profile-avatar";

export function SiteHeader({ categories, profileImage }: { categories: CategorySummary[]; profileImage: string | null }) {
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
          <Link href="/sobre" className="label px-2 py-3 transition-colors hover:text-fg">
            Sobre
          </Link>
        </div>

        <nav aria-label="Categorias" className="scrollbar-none -mx-4 flex gap-6 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          <NavLink href="/pensamentos">Tudo</NavLink>
          {categories.map((c) => (
            <NavLink key={c.id} href={`/categoria/${c.slug}`} style={accentVars(c.color)}>
              {c.name}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
