import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";

/**
 * Renderiza Markdown como conteúdo NÃO CONFIÁVEL:
 *  - HTML bruto nunca é interpretado (não há rehype-raw);
 *  - protocolos perigosos (javascript:, data:) são removidos pelo urlTransform padrão;
 *  - imagens ficam desativadas nesta versão;
 *  - links externos abrem com rel="noopener noreferrer".
 */
const components: Components = {
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
      <ReactMarkdown disallowedElements={["img"]} unwrapDisallowed components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
