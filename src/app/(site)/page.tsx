import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PostListItem } from "@/components/post-list-item";
import { site } from "@/config/site";
import { accentVars } from "@/lib/color";
import { listCategoriesWithPublicCounts } from "@/server/categories";
import { countPublishedPosts, listLatestPosts } from "@/server/posts";

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: `${site.name} — ${site.tagline}` },
  description: site.description,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [categories, latest, total] = await Promise.all([
    listCategoriesWithPublicCounts(),
    listLatestPosts(6),
    countPublishedPosts(),
  ]);

  return (
    <>
      <section className="pb-20 pt-20 md:pb-32 md:pt-36">
        <p className="label">
          Arquivo pessoal
          {total > 0 ? ` · ${total} ${total === 1 ? "fragmento" : "fragmentos"}` : ""}
        </p>
        <h1 className="mt-8 text-[clamp(4rem,14vw,10.5rem)] font-light leading-[0.88] tracking-[-0.04em]">
          Minha
          <br />
          <em>Mente</em>
        </h1>
        <p className="mt-10 max-w-[30ch] text-balance text-2xl italic leading-snug text-muted md:text-[1.9rem]">
          {site.tagline}
        </p>
      </section>

      {categories.length > 0 ? (
        <section id="categorias" aria-labelledby="categorias-titulo">
          <div className="mb-8 flex items-baseline justify-between">
            <h2 id="categorias-titulo" className="label">
              Categorias
            </h2>
          </div>
          <ul className="border-b border-line">
            {categories.map((c, i) => (
              <li key={c.id} className="group rule-sweep relative border-t border-line" style={accentVars(c.color)}>
                <Link href={`/categoria/${c.slug}`} className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-4 py-6 md:py-8">
                  <span className="label text-faint transition-colors group-hover:text-(--accent-text)">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="block text-[2rem] leading-none tracking-[-0.02em] transition-colors duration-200 group-hover:text-(--accent-text) md:text-[2.6rem]">
                      {c.name}
                    </span>
                    {c.description ? (
                      <span className="mt-3 block max-w-[52ch] text-base leading-relaxed text-muted">{c.description}</span>
                    ) : null}
                  </span>
                  <span className="label" aria-label={`${c.count} ${c.count === 1 ? "pensamento" : "pensamentos"}`}>
                    {String(c.count).padStart(2, "0")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="recentes" aria-labelledby="recentes-titulo" className="mt-28 md:mt-40">
        <div className="mb-8 flex items-baseline justify-between">
          <h2 id="recentes-titulo" className="label">
            Recentes
          </h2>
          {latest.length > 0 ? (
            <Link href="/pensamentos" className="label border-b border-line pb-1 transition-colors hover:border-fg hover:text-fg">
              Ver todos <span aria-hidden>→</span>
            </Link>
          ) : null}
        </div>

        {latest.length > 0 ? (
          <div className="border-b border-line">
            {latest.map((post) => (
              <PostListItem key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <EmptyState title="Ainda não há pensamentos publicados.">
            Quando o primeiro for publicado, ele aparece aqui.
          </EmptyState>
        )}
      </section>
    </>
  );
}
