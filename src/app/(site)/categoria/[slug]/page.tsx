import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Pagination, parsePage } from "@/components/pagination";
import { PostListItem } from "@/components/post-list-item";
import { accentVars } from "@/lib/color";
import { getCategoryBySlug } from "@/server/categories";
import { listPublishedPosts } from "@/server/posts";
import { getProfileImage } from "@/server/site-settings";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Categoria não encontrada", robots: { index: false } };

  const description = category.description || `Pensamentos sobre ${category.name.toLowerCase()}.`;
  return {
    title: category.name,
    description,
    alternates: { canonical: `/categoria/${category.slug}` },
    openGraph: { title: category.name, description, type: "website", url: `/categoria/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ pagina?: string | string[] }>;
}) {
  const [{ slug }, { pagina }] = await Promise.all([params, searchParams]);

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const [{ posts, page, pageCount, total }, profileImage] = await Promise.all([
    listPublishedPosts({ categorySlug: category.slug, page: parsePage(pagina) }),
    getProfileImage(),
  ]);

  return (
    <div style={accentVars(category.color)}>
      <header className="pb-14 pt-16 md:pb-20 md:pt-28">
        <div aria-hidden className="h-[2px] w-12 bg-(--accent)" />
        <p className="label mt-8">Categoria</p>
        <h1 className="mt-5 text-[clamp(3.25rem,11vw,8rem)] font-light leading-[0.92] tracking-[-0.04em]">
          {category.name}
        </h1>
        {category.description ? (
          <p className="mt-8 max-w-[40ch] text-balance text-xl italic leading-snug text-muted md:text-2xl">
            {category.description}
          </p>
        ) : null}
        <p className="label mt-8">
          {total} {total === 1 ? "pensamento" : "pensamentos"}
        </p>
      </header>

      {posts.length > 0 ? (
        <div className="border-b border-line">
          {posts.map((post) => (
            <PostListItem key={post.id} post={post} profileImage={profileImage} />
          ))}
        </div>
      ) : (
        <EmptyState title="Ainda não há nada aqui.">
          Os pensamentos desta categoria aparecem quando forem publicados.
        </EmptyState>
      )}

      <Pagination page={page} pageCount={pageCount} basePath={`/categoria/${category.slug}`} />
    </div>
  );
}
