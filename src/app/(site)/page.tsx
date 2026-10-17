import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PostListItem } from "@/components/post-list-item";
import { site } from "@/config/site";
import { listCategoriesWithPublicCounts } from "@/server/categories";
import { countPublishedPosts, listLatestPosts } from "@/server/posts";
import { ProfileAvatar } from "@/components/profile-avatar";
import { accentVars } from "@/lib/color";
import { getProfileImage } from "@/server/site-settings";

export const metadata: Metadata = {
  title: { absolute: `${site.name} — ${site.tagline}` },
  description: site.description,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [categories, latest, total, profileImage] = await Promise.all([
    listCategoriesWithPublicCounts(),
    listLatestPosts(6),
    countPublishedPosts(),
    getProfileImage(),
  ]);

  return (
    <>
      <section className="border-b border-line py-8 sm:py-10">
        <div className="flex items-center gap-4">
          <ProfileAvatar size={76} src={profileImage} />
          <div>
            <h1 className="font-sans text-2xl font-bold leading-tight sm:text-3xl">{site.author}</h1>
            <p className="mt-1 font-sans text-sm text-muted">{site.authorHandle}</p>
          </div>
        </div>
        <p className="mt-5 max-w-[44ch] text-[1.05rem] leading-relaxed text-(--site-copy)">{site.tagline}</p>
        <p className="label mt-4">{total} {total === 1 ? "publicação" : "publicações"}</p>
      </section>

      {categories.length > 0 ? (
        <nav id="categorias" aria-label="Filtrar por categoria" className="border-b border-line py-4">
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/categoria/${c.slug}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-(--site-chip) px-4 font-sans text-sm text-(--site-copy) transition-colors hover:border-(--accent) hover:text-fg"
                  style={accentVars(c.color)}
                >
                  {c.name}<span className="text-xs text-muted">{c.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <section id="recentes" aria-labelledby="recentes-titulo">
        <div className="flex items-center justify-between border-b border-line px-1 py-4 sm:px-3">
          <h2 id="recentes-titulo" className="font-sans text-sm font-semibold tracking-wide">
            Publicações
          </h2>
          {latest.length > 0 ? (
            <Link href="/pensamentos" className="font-sans text-sm font-medium text-(--site-link) transition-colors hover:text-fg">
              Ver arquivo <span aria-hidden>→</span>
            </Link>
          ) : null}
        </div>

        {latest.length > 0 ? (
          <div>
            {latest.map((post) => (
              <PostListItem key={post.id} post={post} profileImage={profileImage} />
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
