import { Fragment, memo, useMemo, useState, type ReactNode } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { lexer, type Token, type Tokens } from "marked";
import { absoluteUrl } from "@/lib/config";
import { AppText, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, fonts, radius, space, type } from "@/theme/tokens";
import { splitDetails, type Segment } from "./details";

/**
 * Renderiza o Markdown dos pensamentos com componentes nativos.
 * Mesmas regras do site (src/components/markdown.tsx):
 *  - HTML bruto nunca é interpretado;
 *  - imagens só de /uploads/posts/, com as dimensões salvas em mm-width/mm-height;
 *  - links internos abrem no app, externos no navegador;
 *  - :::details[título] vira um bloco recolhível.
 */

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function decode(text: string) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function openLink(href: string) {
  const post = /^\/pensamento\/([a-z0-9-]+)\/?$/.exec(href);
  if (post) return router.push({ pathname: "/post/[slug]", params: { slug: post[1] } });
  const category = /^\/categoria\/([a-z0-9-]+)\/?$/.exec(href);
  if (category) return router.push({ pathname: "/categoria/[slug]", params: { slug: category[1] } });
  if (href.startsWith("#")) return;
  if (href.startsWith("/") && !href.startsWith("//")) return void Linking.openURL(absoluteUrl(href));
  if (/^(https?:|mailto:)/i.test(href)) return void Linking.openURL(href);
}

/* ------------------------------- Imagens ------------------------------- */

function parseImage(href: string) {
  if (!href.startsWith("/uploads/posts/") || href.startsWith("//")) return null;
  const url = new URL(href, "https://minha-mente.invalid");
  const width = Number(url.searchParams.get("mm-width"));
  const height = Number(url.searchParams.get("mm-height"));
  return {
    src: absoluteUrl(url.pathname),
    ratio: width > 0 && height > 0 ? width / height : 4 / 3,
    width: width > 0 ? width : null,
  };
}

function PostImage({ href, alt }: { href: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const { width: screen } = useWindowDimensions();
  const image = parseImage(href);
  if (!image) return null;
  return (
    <>
      <Touchable accessibilityRole="imagebutton" accessibilityLabel={alt || "Imagem"} onPress={() => setOpen(true)} style={styles.imageFrame}>
        <Image
          source={{ uri: image.src }}
          style={{ width: "100%", maxWidth: image.width ?? undefined, aspectRatio: image.ratio }}
          contentFit="contain"
          transition={180}
          accessibilityLabel={alt}
        />
      </Touchable>
      {alt ? <AppText variant="small" color={colors.faint} style={{ marginTop: -space.sm, marginBottom: space.md }}>{alt}</AppText> : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.viewer} onPress={() => setOpen(false)} accessibilityLabel="Fechar imagem">
          <Image source={{ uri: image.src }} style={{ width: screen, aspectRatio: image.ratio }} contentFit="contain" />
          <View style={styles.viewerClose}>
            <Icon name="close" color={colors.text} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/* --------------------------- Elementos de linha -------------------------- */

function inline(tokens: Token[] | undefined, keyPrefix: string): ReactNode[] {
  return (tokens ?? []).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (token.type) {
      case "strong":
        return <AppText key={key} style={{ fontFamily: fonts.serifMedium, color: colors.text }}>{inline((token as Tokens.Strong).tokens, key)}</AppText>;
      case "em":
        return <AppText key={key} style={{ fontFamily: fonts.serifItalic }}>{inline((token as Tokens.Em).tokens, key)}</AppText>;
      case "del":
        return <AppText key={key} style={{ textDecorationLine: "line-through" }}>{inline((token as Tokens.Del).tokens, key)}</AppText>;
      case "codespan":
        return <AppText key={key} style={styles.codespan}>{decode((token as Tokens.Codespan).text)}</AppText>;
      case "link": {
        const link = token as Tokens.Link;
        return (
          <AppText key={key} style={styles.link} onPress={() => openLink(link.href)} accessibilityRole="link">
            {inline(link.tokens, key)}
          </AppText>
        );
      }
      case "br":
        return "\n";
      case "text": {
        const text = token as Tokens.Text;
        return text.tokens?.length ? <Fragment key={key}>{inline(text.tokens, key)}</Fragment> : decode(text.text);
      }
      case "escape":
        return decode((token as Tokens.Escape).text);
      case "checkbox":
        return (token as Tokens.Checkbox).checked ? "☑ " : "☐ ";
      case "image":
      case "html":
        return null; // imagens viram blocos (ver Paragraph); HTML nunca é interpretado
      default:
        return "raw" in token ? decode(String(token.raw)) : null;
    }
  });
}

/** Parágrafo com imagens: o texto segue em blocos e cada imagem ocupa a largura. */
function Paragraph({ token, textStyle }: { token: Tokens.Paragraph; textStyle?: object }) {
  const groups: (Token[] | Tokens.Image)[] = [];
  for (const child of token.tokens) {
    if (child.type === "image") groups.push(child as Tokens.Image);
    else if (Array.isArray(groups.at(-1))) (groups.at(-1) as Token[]).push(child);
    else groups.push([child]);
  }
  return (
    <>
      {groups.map((group, index) =>
        Array.isArray(group) ? (
          group.every((t) => t.type === "text" && !String((t as Tokens.Text).text).trim()) ? null : (
            <AppText key={index} variant="body" style={[styles.paragraph, textStyle]}>{inline(group, `p${index}`)}</AppText>
          )
        ) : (
          <PostImage key={index} href={group.href} alt={group.text} />
        ),
      )}
    </>
  );
}

/* ------------------------------- Blocos -------------------------------- */

function Blocks({ tokens, depth = 0 }: { tokens: Token[]; depth?: number }) {
  return (
    <>
      {tokens.map((token, index) => (
        <Block key={index} token={token} depth={depth} index={index} />
      ))}
    </>
  );
}

function Block({ token, depth, index }: { token: Token; depth: number; index: number }) {
  switch (token.type) {
    case "heading": {
      const heading = token as Tokens.Heading;
      const style = heading.depth <= 1 ? styles.h1 : heading.depth === 2 ? styles.h2 : styles.h3;
      return <AppText style={[style, index === 0 && { marginTop: 0 }]} accessibilityRole="header">{inline(heading.tokens, "h")}</AppText>;
    }
    case "paragraph":
      return <Paragraph token={token as Tokens.Paragraph} />;
    case "blockquote":
      return (
        <View style={styles.quote}>
          <Blocks tokens={(token as Tokens.Blockquote).tokens} depth={depth + 1} />
        </View>
      );
    case "list": {
      const list = token as Tokens.List;
      const start = typeof list.start === "number" ? list.start : 1;
      return (
        <View style={styles.list}>
          {list.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <AppText variant="body" color={colors.violet300} style={styles.bullet}>{list.ordered ? `${start + i}.` : "•"}</AppText>
              <View style={{ flex: 1 }}>
                <ListItemBody item={item} depth={depth} />
              </View>
            </View>
          ))}
        </View>
      );
    }
    case "code":
      return (
        <ScrollView horizontal style={styles.codeBlock} contentContainerStyle={{ padding: space.md }}>
          <AppText style={styles.codeText}>{(token as Tokens.Code).text}</AppText>
        </ScrollView>
      );
    case "hr":
      return <View style={styles.hr} />;
    case "table":
      return <Table token={token as Tokens.Table} />;
    case "text": {
      const text = token as Tokens.Text;
      return <AppText variant="body" style={styles.paragraph}>{text.tokens ? inline(text.tokens, "t") : decode(text.text)}</AppText>;
    }
    case "space":
    case "def":
    case "html":
      return null;
    default:
      return null;
  }
}

function ListItemBody({ item, depth }: { item: Tokens.ListItem; depth: number }) {
  // Em listas "compactas", o conteúdo vem como token "text" com filhos de linha.
  return (
    <>
      {item.tokens.map((child, i) =>
        child.type === "text" ? (
          <AppText key={i} variant="body" style={styles.listText}>
            {(child as Tokens.Text).tokens ? inline((child as Tokens.Text).tokens, `li${i}`) : decode((child as Tokens.Text).text)}
          </AppText>
        ) : child.type === "checkbox" ? (
          <AppText key={i} variant="body">{(child as Tokens.Checkbox).checked ? "☑ " : "☐ "}</AppText>
        ) : (
          <Block key={i} token={child} depth={depth + 1} index={i} />
        ),
      )}
    </>
  );
}

function Table({ token }: { token: Tokens.Table }) {
  const columns = token.header.length;
  const width = Math.max(120, Math.min(220, 640 / Math.max(1, columns)));
  const cell = (c: Tokens.TableCell, header: boolean, key: string) => (
    <View key={key} style={[styles.cell, { width }, header && styles.headerCell]}>
      <AppText variant={header ? "uiMedium" : "ui"} style={{ textAlign: c.align ?? "left" }}>{inline(c.tokens, key)}</AppText>
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.table}>
      <View>
        <View style={styles.row}>{token.header.map((c, i) => cell(c, true, `h${i}`))}</View>
        {token.rows.map((row, r) => (
          <View key={r} style={styles.row}>{row.map((c, i) => cell(c, false, `r${r}c${i}`))}</View>
        ))}
      </View>
    </ScrollView>
  );
}

/* --------------------------- Blocos recolhíveis -------------------------- */

function Details({ summary, body }: { summary: string; body: Segment[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.details}>
      <Touchable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={styles.summary}>
        <AppText variant="uiMedium" color={colors.violet200} style={{ flex: 1 }}>{summary}</AppText>
        <AppText color={colors.violet300}>{open ? "−" : "+"}</AppText>
      </Touchable>
      {open ? (
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
          <SegmentList segments={body} />
        </View>
      ) : null}
    </View>
  );
}

function SegmentList({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "markdown" ? (
          <Blocks key={index} tokens={lexer(segment.text, { gfm: true })} />
        ) : (
          <Details key={index} summary={segment.summary} body={segment.body} />
        ),
      )}
    </>
  );
}

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  const segments = useMemo(() => splitDetails(children ?? ""), [children]);
  return (
    <View>
      <SegmentList segments={segments} />
    </View>
  );
});

const styles = StyleSheet.create({
  paragraph: { marginBottom: space.lg, color: colors.text },
  h1: { ...type.title, fontSize: 27, lineHeight: 33, marginTop: space.xl, marginBottom: space.md, color: colors.text },
  h2: { ...type.title, fontSize: 23, lineHeight: 29, marginTop: space.xl, marginBottom: space.md, color: colors.text },
  h3: { fontFamily: fonts.sansSemibold, fontSize: 17, lineHeight: 23, marginTop: space.lg, marginBottom: space.sm, color: colors.text },
  link: { color: colors.violet300, textDecorationLine: "underline", textDecorationColor: colors.violet700 },
  codespan: { fontFamily: mono, fontSize: 14, color: colors.violet200, backgroundColor: colors.violet950 },
  codeBlock: { backgroundColor: colors.surfaceRaised, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, marginBottom: space.lg },
  codeText: { fontFamily: mono, fontSize: 13, lineHeight: 20, color: colors.violet200 },
  quote: { borderLeftWidth: 2, borderLeftColor: colors.violet600, paddingLeft: space.lg, marginBottom: space.lg, opacity: 0.92 },
  list: { marginBottom: space.lg, gap: space.xs },
  listItem: { flexDirection: "row", gap: space.sm },
  bullet: { minWidth: 18 },
  listText: { color: colors.text },
  hr: { height: 1, backgroundColor: colors.lineStrong, marginVertical: space.xl, width: 48, alignSelf: "center" },
  table: { marginBottom: space.lg, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  row: { flexDirection: "row" },
  cell: { padding: space.sm, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  headerCell: { backgroundColor: colors.surfaceRaised },
  imageFrame: { marginBottom: space.lg, borderRadius: radius.md, overflow: "hidden", alignItems: "center", backgroundColor: colors.surface },
  viewer: { flex: 1, backgroundColor: "rgba(5,4,9,0.96)", alignItems: "center", justifyContent: "center" },
  viewerClose: { position: "absolute", top: 60, right: 20 },
  details: { borderWidth: 1, borderColor: colors.violet800, borderRadius: radius.md, marginBottom: space.lg, backgroundColor: colors.violet950 },
  summary: { flexDirection: "row", alignItems: "center", padding: space.md, gap: space.sm },
});
