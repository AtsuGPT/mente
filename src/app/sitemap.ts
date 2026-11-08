import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

// O conteúdo fica dentro dos ambientes do app (que exigem abrir um ambiente): só a entrada é indexável.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl()}/`, changeFrequency: "weekly", priority: 1 }];
}
