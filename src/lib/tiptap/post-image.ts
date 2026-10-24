import Image from "@tiptap/extension-image";
import type { JSONContent, MarkdownToken } from "@tiptap/core";

function imageUrl(src: string, width?: number | null, height?: number | null) {
  const url = new URL(src, "https://minha-mente.invalid");
  url.searchParams.delete("mm-width");
  url.searchParams.delete("mm-height");
  if (width && width > 0) url.searchParams.set("mm-width", String(Math.round(width)));
  if (height && height > 0) url.searchParams.set("mm-height", String(Math.round(height)));
  return src.startsWith("/") && !src.startsWith("//") ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

function imageDimensions(href: string) {
  const url = new URL(href, "https://minha-mente.invalid");
  const width = Number(url.searchParams.get("mm-width"));
  const height = Number(url.searchParams.get("mm-height"));
  url.searchParams.delete("mm-width");
  url.searchParams.delete("mm-height");
  return {
    src: href.startsWith("/") && !href.startsWith("//") ? `${url.pathname}${url.search}${url.hash}` : url.toString(),
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}

export const PostImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute("width")) || null,
        renderHTML: ({ width }) => width ? { width } : {},
      },
      height: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute("height")) || null,
        renderHTML: ({ height }) => height ? { height } : {},
      },
    };
  },
  parseMarkdown(token: MarkdownToken, helpers) {
    const image = imageDimensions(String(token.href ?? ""));
    return helpers.createNode("image", {
      src: image.src,
      alt: token.text ?? "",
      title: token.title ?? null,
      width: image.width,
      height: image.height,
    });
  },
  renderMarkdown(node: JSONContent) {
    const attrs = node.attrs ?? {};
    const src = imageUrl(String(attrs.src ?? ""), Number(attrs.width) || null, Number(attrs.height) || null);
    const alt = String(attrs.alt ?? "").replace(/[\[\]]/g, "\\$&");
    const title = typeof attrs.title === "string" && attrs.title ? ` "${attrs.title.replace(/"/g, '\\"')}"` : "";
    return `![${alt}](${src}${title})`;
  },
});