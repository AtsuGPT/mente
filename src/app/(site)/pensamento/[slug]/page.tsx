import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ThoughtArticle } from "@/components/thought-article";
import { site } from "@/config/site";
import { accentVars } from "@/lib/color";
import { siteUrl } from "@/lib/env";
import { formatDateShort } from "@/lib/format";
import { excerpt } from "@/lib/text";
import { getPublishedPostBySlug, listRelatedPosts } from "@/server/posts";

export const revalidate = 60;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return { title: "Pensamento não encontrado", robots: { index: false } };

  const description = excerpt(post.content, 155) || site.description;
  const path = `/pensamento/${post.slug}`;

  return {
    title: post.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: path,
      publishedTime: post.publishedAt.toISOString(),
      section: post.categories[0]?.name,
      tags: post.categories.map((c) => c.name),
    },
    twitter: { card: "summary_large_image", title: post.title, description },
  };
}

export default async function ThoughtPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const related = await listRelatedPosts(post, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    datePublished: post.publishedAt.toISOString(),
    description: excerpt(post.content, 155),
    url: `${siteUrl()}/pensamento/${post.slug}`,
    inLanguage: "pt-BR",
    isPartOf: { "@type": "Blog", name: site.name, url: siteUrl() },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Escapa "<" para que o conteúdo jamais feche a tag <script>.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <ThoughtArticle post={post} />

      {related.length > 0 ? (
        <aside aria-labelledby="relacionados" className="mx-auto mt-20 max-w-[42rem] border-t border-line pt-8">
          <h2 id="relacionados" className="label">
            Continue lendo
          </h2>
          <ul className="mt-2">
            {related.map((item) => (
              <li key={item.id} className="group rule-sweep relative border-b border-line" style={accentVars(item.categories[0]?.color)}>
                <Link href={`/pensamento/${item.slug}`} className="flex items-baseline justify-between gap-6 py-5">
                  <span className="text-xl leading-snug tracking-[-0.01em] transition-colors group-hover:text-(--accent-text) md:text-2xl">
                    {item.title}
                  </span>
                  <time className="label shrink-0" dateTime={item.publishedAt.toISOString()}>
                    {formatDateShort(item.publishedAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </>
  );
}
