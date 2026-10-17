import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { accentVars } from "@/lib/color";
import { listCategoriesWithPublicCounts } from "@/server/categories";

export const metadata: Metadata = {
  title: "Arquivo",
  description: "Categorias e pensamentos organizados por assunto.",
  alternates: { canonical: "/arquivo" },
};

export default async function ArchivePage() {
  const categories = await listCategoriesWithPublicCounts();

  return (
    <>
      <header className="site-page-heading">
        <p className="label">Arquivo pessoal</p>
        <h1 className="mt-3 font-sans text-3xl font-semibold">Pastas</h1>
        <p className="mt-2 text-sm text-muted">Pensamentos organizados por assunto.</p>
      </header>

      {categories.length ? (
        <ul className="site-folder-list">
          {categories.map((category) => (
            <li key={category.id}>
              <Link href={`/categoria/${category.slug}`} className="site-folder-row" style={accentVars(category.color)}>
                <span className="site-folder-icon" aria-hidden="true"><span /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-base font-medium">{category.name}</span>
                  {category.description ? <span className="mt-1 block text-sm leading-relaxed text-muted">{category.description}</span> : null}
                </span>
                <span className="site-folder-count">{category.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="Ainda não há pastas." />}
    </>
  );
}