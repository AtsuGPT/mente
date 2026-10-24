import Link from "next/link";
import Image from "next/image";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";

type DirectiveNode = {
  name?: string;
  children?: DirectiveNode[];
  data?: { directiveLabel?: boolean; hName?: string; hProperties?: Record<string, unknown> };
  type?: string;
  value?: string;
};

function remarkDetails() {
  return (tree: DirectiveNode) => {
    visit(tree as never, "containerDirective", (node: unknown) => {
      const directive = node as DirectiveNode;
      if (directive.name !== "details") return;

      const children = directive.children ?? [];
      const labelIndex = children.findIndex((child) => child.data?.directiveLabel);
      const label = labelIndex >= 0 ? children[labelIndex] : null;
      const body = children.filter((_, index) => index !== labelIndex);
      const summary: DirectiveNode = {
        type: "paragraph",
        data: { hName: "summary" },
        children: label?.children?.length ? label.children : [{ type: "text", value: "Detalhes" }],
      };

      directive.data = { ...directive.data, hName: "details" };
      directive.children = [summary, ...body];
    });
  };
}

const markdownSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary"],
  attributes: {
    ...defaultSchema.attributes,
    details: ["open"],
    summary: [],
  },
};

/**
 * Renderiza Markdown como conteúdo NÃO CONFIÁVEL:
 *  - HTML bruto nunca é interpretado (não há rehype-raw);
 *  - protocolos perigosos (javascript:, data:) são removidos pelo urlTransform padrão;
 *  - imagens ficam desativadas nesta versão;
 *  - links externos abrem com rel="noopener noreferrer".
 */
const components: Components = {
  img({ src, alt, title }) {
    if (typeof src !== "string" || !src.startsWith("/uploads/posts/") || src.startsWith("//")) return null;
    const url = new URL(src, "https://minha-mente.invalid");
    const width = Number(url.searchParams.get("mm-width"));
    const height = Number(url.searchParams.get("mm-height"));
    url.searchParams.delete("mm-width");
    url.searchParams.delete("mm-height");
    const safeWidth = Number.isFinite(width) && width > 0 ? Math.min(2400, Math.round(width)) : 1200;
    const safeHeight = Number.isFinite(height) && height > 0 ? Math.min(2400, Math.round(height)) : 800;

    return (
      <Image
        src={`${url.pathname}${url.search}${url.hash}`}
        alt={alt ?? ""}
        title={title ?? undefined}
        width={safeWidth}
        height={safeHeight}
        unoptimized
        sizes="(max-width: 44rem) 100vw, 44rem"
        style={{ width: width > 0 ? `${safeWidth}px` : "100%", maxWidth: "100%", height: "auto" }}
      />
    );
  },
  a({ href, children }) {
    if (!href) return <span>{children}</span>;
    if (href.startsWith("/") && !href.startsWith("//")) {
      return <Link href={href}>{children}</Link>;
    }
    if (href.startsWith("#")) return <a href={href}>{children}</a>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-mm">
      <ReactMarkdown
        disallowedElements={["img"]}
        unwrapDisallowed
        components={components}
        remarkPlugins={[remarkGfm, remarkDirective, remarkDetails]}
        rehypePlugins={[[rehypeSanitize, markdownSchema]]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
