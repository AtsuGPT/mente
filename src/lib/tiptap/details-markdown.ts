import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import type { JSONContent, MarkdownLexerConfiguration, MarkdownToken } from "@tiptap/core";

type DetailsToken = MarkdownToken & {
  summary?: string;
  tokens?: MarkdownToken[];
};

export const DetailsMarkdown = Details.extend({
  markdownTokenizer: {
    name: "details",
    level: "block",
    start(source) {
      const match = /^:::details\[/m.exec(source);
      return match?.index ?? -1;
    },
    tokenize(source, _tokens, lexer: MarkdownLexerConfiguration) {
      const lines = source.split("\n");
      const opening = /^:::details\[(.*)\]\s*$/.exec(lines[0] ?? "");
      if (!opening) return undefined;

      let depth = 1;
      for (let index = 1; index < lines.length; index += 1) {
        if (/^:::details\[.*\]\s*$/.test(lines[index])) {
          depth += 1;
        } else if (/^:::\s*$/.test(lines[index])) {
          depth -= 1;
          if (depth === 0) {
            const body = lines.slice(1, index).join("\n");
            return {
              type: "details",
              raw: lines.slice(0, index + 1).join("\n"),
              summary: opening[1].replace(/\\\]/g, "]"),
              tokens: lexer.blockTokens(body),
            } as DetailsToken;
          }
        }
      }

      return undefined;
    },
  },
  parseMarkdown(token: DetailsToken, helpers) {
    const summary = helpers.parseInline(
      token.summary ? helpers.tokenizeInline?.(token.summary) ?? [] : [],
    );
    const body = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode("details", {}, [
      helpers.createNode("detailsSummary", {}, summary.length ? summary : [helpers.createTextNode("Detalhes")]),
      helpers.createNode("detailsContent", {}, body.length ? body : [helpers.createNode("paragraph")]),
    ]);
  },
  renderMarkdown(node: JSONContent, helpers) {
    const summary = node.content?.find((child) => child.type === "detailsSummary");
    const body = node.content?.find((child) => child.type === "detailsContent");
    const summaryText = helpers.renderChildren(summary?.content ?? []).replace(/\]/g, "\\]");
    const bodyText = helpers.renderChildren(body?.content ?? [], "\n\n");
    return `:::details[${summaryText || "Detalhes"}]\n\n${bodyText}\n\n:::`;
  },
});

export { DetailsContent, DetailsSummary };
