import { memo } from "react";
import { markOrigin } from "@/lib/feedback";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { readableAccent } from "@shared/color";
import type { Category, PostCard as PostCardData } from "@/lib/types";
import { formatDateShort, formatNumber } from "@/lib/format";
import { AppText, Skeleton, Touchable } from "./ui/primitives";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { colors, fonts, radius, space } from "@/theme/tokens";

export function CategoryTag({ category, onPress }: { category: Category; onPress?: () => void }) {
  return (
    <Touchable onPress={onPress} disabled={!onPress} hitSlop={6} pressScale={0.94} style={[styles.tag, { borderColor: `${category.color}40` }]}>
      <View style={[styles.dot, { backgroundColor: category.color }]} />
      <AppText variant="label" color={readableAccent(category.color)} style={{ fontSize: 11 }}>{category.name}</AppText>
    </Touchable>
  );
}

export function Avatar({ src, size = 36 }: { src?: string | null; size?: number }) {
  return (
    <View style={[styles.avatarRing, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.avatar, { borderRadius: size / 2 }]}>
        {src ? (
          <Image source={{ uri: src }} style={{ width: size - 2, height: size - 2 }} contentFit="cover" />
        ) : (
          <AppText style={{ fontFamily: fonts.serif, fontSize: size * 0.45, color: colors.violet200 }}>K</AppText>
        )}
      </View>
    </View>
  );
}

/**
 * Pensamento no feed (redesign de 27/11): texto, sem moldura. O número na cor da pasta, a pasta e a data no alto,
 * o título em serifa e duas linhas do texto. Um fio separa um do outro; o destaque é só o fundo acendendo no
 * mouse por cima ou no toque. O feed continua sendo de leitura, não um painel de cartões.
 */
export const PostCard = memo(function PostCard({ post }: { post: PostCardData; author?: string; avatar?: string | null; featured?: boolean }) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const lit = useAnimatedStyle(() => ({ opacity: Math.max(hover.value, press.value * 1.4) }));
  const category = post.categories[0];
  // A cor da pasta (legível sobre o preto) marca o número: diferencia os pensamentos sem imagem.
  const accent = readableAccent(category?.color ?? colors.violet400);
  return (
    <Touchable
      accessibilityRole="link"
      accessibilityLabel={post.title}
      onPressIn={(event) => markOrigin(event.nativeEvent.pageY)}
      onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: post.slug } })}
      hover={hover}
      press={press}
      pressScale={0.99}
      style={styles.entry}
    >
      <Animated.View pointerEvents="none" style={[styles.lit, lit]} />
      <View style={styles.meta}>
        <AppText style={[styles.numeral, { color: accent }]}>Nº {formatNumber(post.number)}</AppText>
        {category ? (
          <Touchable onPress={() => router.push({ pathname: "/categoria/[slug]", params: { slug: category.slug } })} hitSlop={6} pressScale={0.95} style={styles.folder} accessibilityLabel={`Pasta ${category.name}`}>
            <View style={[styles.dot, { backgroundColor: category.color }]} />
            <AppText variant="small" color={colors.muted} numberOfLines={1}>{category.name}{post.categories.length > 1 ? ` +${post.categories.length - 1}` : ""}</AppText>
          </Touchable>
        ) : null}
        <AppText variant="small" color={colors.faint} numberOfLines={1} style={styles.date}>· {formatDateShort(post.publishedAt)}</AppText>
      </View>
      <AppText variant="title" style={styles.title} numberOfLines={3}>{post.title}</AppText>
      {post.excerpt ? (
        <AppText variant="body" color={colors.muted} numberOfLines={2} style={styles.excerpt}>{post.excerpt}</AppText>
      ) : null}
    </Touchable>
  );
});

/** Mesma silhueta do pensamento, enquanto o feed carrega (a lista não "salta" ao chegar). */
export function PostCardSkeleton() {
  return (
    <View style={[styles.entry, { gap: space.sm }]}>
      <View style={styles.meta} aria-hidden>
        <Skeleton style={{ width: 52, height: 12 }} />
        <Skeleton style={{ width: 96, height: 12 }} />
      </View>
      <Skeleton style={{ marginTop: space.xs, width: "72%", height: 22 }} />
      <Skeleton style={{ width: "100%", height: 13 }} />
      <Skeleton style={{ width: "84%", height: 13 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { paddingVertical: space.lg + 4, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line },
  lit: { position: "absolute", top: 8, bottom: 8, left: -space.md, right: -space.md, borderRadius: radius.lg, backgroundColor: "rgba(255,255,255,0.03)" },
  folder: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  numeral: { fontFamily: fonts.serifItalic, fontSize: 15, lineHeight: 19, letterSpacing: 0.2 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.lineStrong },
  date: { flexShrink: 1 },
  badge: { fontSize: 10, lineHeight: 13, letterSpacing: 1 },
  title: { marginTop: space.sm, fontSize: 22, lineHeight: 28 },
  excerpt: { marginTop: 6, fontSize: 16.5, lineHeight: 26 },
  byline: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth * 2, backgroundColor: "rgba(255,255,255,0.03)" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  avatarRing: { padding: 1, backgroundColor: "rgba(165,139,247,0.35)" },
  avatar: { flex: 1, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.violet950 },
});
