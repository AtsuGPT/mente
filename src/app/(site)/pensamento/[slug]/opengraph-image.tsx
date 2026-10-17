import { ImageResponse } from "next/og";
import { site } from "@/config/site";
import { getPublishedPostBySlug } from "@/server/posts";

export const alt = site.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  const title = post?.title ?? site.name;
  const accent = post?.categories[0]?.color ?? "#929292";
  const category = post?.categories[0]?.name;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#080808",
          color: "#EAEAEA",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ width: 64, height: 4, background: accent, marginBottom: 36 }} />
          <div style={{ fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: "#929292" }}>
            {category ?? "Arquivo pessoal"}
          </div>
        </div>

        <div
          style={{
            fontSize: title.length > 60 ? 62 : 80,
            lineHeight: 1.06,
            letterSpacing: -2,
            fontWeight: 300,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>

        <div style={{ fontSize: 28, color: "#929292" }}>{site.name}</div>
      </div>
    ),
    size,
  );
}
