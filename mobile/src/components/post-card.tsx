import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { readableAccent } from "@shared/color";
import type { Category, PostCard as PostCardData } from "@/lib/types";
import { formatDateShort, formatNumber } from "@/lib/format";
import { AppText, Skeleton, Touchable } from "./ui/primitives";
import { Surface } from "./ui/surface";
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
 * Cartão de pensamento: superfície quase preta com fio discreto. A cor da pasta aparece só no
 * ponto da etiqueta; o destaque (featured) é ocasional: o primeiro do feed ganha uma luz roxa
 * contida no alto e o título maior. Pressionar acende a borda.
 */
export const PostCard = memo(function PostCard({ post, author, avatar, featured = false }: { post: PostCardData; author: string; avatar?: string | null; featured?: boolean }) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const lit = useAnimatedStyle(() => ({ opacity: Math.max(hover.value * 0.6, press.value) }));
  // A cor da pasta (legível sobre o preto) marca o número: diferencia os pensamentos sem imagem.
  const accent = readableAccent(post.categories[0]?.color ?? colors.violet400);
  return (
    <Touchable
      accessibilityRole="link"
      accessibilityLabel={post.title}
      onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: post.slug } })}
      hover={hover}
      press={press}
      pressScale={0.985}
    >
      <Surface contentStyle={styles.card}>
        {featured ? (
          <LinearGradient colors={["rgba(132,97,240,0.1)", "rgba(132,97,240,0)"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.45, y: 0.7 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        ) : null}
        {/* Cabeçalho tipográfico: o número do pensamento, na cor da pasta, e a data. */}
        <View style={styles.meta}>
          <AppText style={[styles.numeral, { color: accent }]}>Nº {formatNumber(post.number)}</AppText>
          <View style={styles.metaDot} />
          <AppText variant="small" color={colors.faint} numberOfLines={1} style={styles.date}>{formatDateShort(post.publishedAt)}</AppText>
          {featured ? <AppText variant="label" color={colors.violet300} style={styles.badge}>Mais recente</AppText> : null}
        </View>

        <AppText variant="title" style={featured ? styles.titleFeatured : styles.title} numberOfLines={featured ? 4 : 3}>{post.title}</AppText>
        {post.excerpt ? (
          <AppText variant="body" color={colors.muted} numberOfLines={featured ? 4 : 2} style={featured ? styles.excerptFeatured : styles.excerpt}>{post.excerpt}</AppText>
        ) : null}
        {featured ? (
          <View style={styles.byline}>
            <Avatar src={avatar} size={22} />
            <AppText variant="small" color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{author}</AppText>
          </View>
        ) : null}

        {post.categories.length ? (
          <View style={styles.tags}>
            {post.categories.map((category) => (
              <CategoryTag key={category.id} category={category} onPress={() => router.push({ pathname: "/categoria/[slug]", params: { slug: category.slug } })} />
            ))}
          </View>
        ) : null}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.lit, lit]} />
      </Surface>
    </Touchable>
  );
});

/** Mesma silhueta do cartão, enquanto o feed carrega (a lista não "salta" ao chegar). */
export function PostCardSkeleton() {
  return (
    <Surface contentStyle={[styles.card, { gap: space.sm }]}>
      <View style={styles.meta} aria-hidden>
        <Skeleton style={{ width: 52, height: 12 }} />
        <Skeleton style={{ width: 96, height: 12 }} />
      </View>
      <Skeleton style={{ marginTop: space.xs, width: "72%", height: 22 }} />
      <Skeleton style={{ width: "100%", height: 13 }} />
      <Skeleton style={{ width: "84%", height: 13 }} />
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.lg, paddingHorizontal: space.lg + 2 },
  lit: { borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(165,139,247,0.55)" },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  numeral: { fontFamily: fonts.serifItalic, fontSize: 15, lineHeight: 19, letterSpacing: 0.2 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.lineStrong },
  date: { flex: 1, flexShrink: 1 },
  badge: { fontSize: 10, lineHeight: 13, letterSpacing: 1 },
  title: { marginTop: space.sm, fontSize: 21, lineHeight: 27 },
  titleFeatured: { marginTop: space.sm + 2, fontSize: 27, lineHeight: 33 },
  excerpt: { marginTop: 6, fontSize: 15.5, lineHeight: 23 },
  excerptFeatured: { marginTop: space.sm, fontSize: 16.5, lineHeight: 26 },
  byline: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth * 2, backgroundColor: "rgba(255,255,255,0.03)" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  avatarRing: { padding: 1, backgroundColor: "rgba(165,139,247,0.35)" },
  avatar: { flex: 1, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.violet950 },
});
