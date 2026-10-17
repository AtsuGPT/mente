import Link from "next/link";
import { accentVars } from "@/lib/color";
import type { CategorySummary } from "@/server/categories";
import { site } from "@/config/site";
import { NavLink } from "./nav-link";

export function SiteHeader({ categories }: { categories: CategorySummary[] }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[72rem] flex-wrap items-baseline justify-between gap-x-10 gap-y-4 px-6 py-6 md:px-10 md:py-8">
        <Link href="/" className="text-[1.4rem] leading-none tracking-[-0.015em]" aria-label={`${site.name} — início`}>
          Minha <em className="font-light">Mente</em>
        </Link>

        <nav aria-label="Principal" className="flex w-full flex-wrap items-baseline gap-x-7 gap-y-3 md:w-auto">
          {categories.map((c) => (
            <NavLink key={c.id} href={`/categoria/${c.slug}`} style={accentVars(c.color)}>
              {c.name}
            </NavLink>
          ))}
          {categories.length > 0 ? <span aria-hidden className="hidden h-3 w-px self-center bg-line md:block" /> : null}
          <NavLink href="/sobre">Sobre</NavLink>
        </nav>
      </div>
    </header>
  );
}
