import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { listCategories } from "@/server/categories";
import { listSitemapEntries } from "@/server/posts";

// Gerado sob demanda: depende do banco e deve refletir novas publicações.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [categories, posts] = await Promise.all([listCategories(), listSitemapEntries()]);

  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pensamentos`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/sobre`, changeFrequency: "yearly", priority: 0.3 },
    ...categories.map((c) => ({
      url: `${base}/categoria/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...posts.map((p) => ({
      url: `${base}/pensamento/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}
