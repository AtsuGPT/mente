import { memo } from "react";
import { markOrigin } from "@/lib/feedback";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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

/** Desfoque forte do que está atrás (só na web; no celular o vidro é a camada escura com a borda de luz). */
const webGlass = Platform.OS === "web" ? ({ backdropFilter: "blur(28px) saturate(160%)", WebkitBackdropFilter: "blur(28px) saturate(160%)", boxShadow: "0 24px 48px -28px rgba(0,0,0,0.95)" } as unknown as ViewStyle) : null;

/** Borda de luz (como o vidro da Apple): clara no alto, à esquerda, e se apaga para baixo. */
const RIM = ["rgba(255,255,255,0.15)", "rgba(255,255,255,0.05)", "rgba(255,255,255,0.025)"] as const;
const RIM_LIT = ["rgba(255,255,255,0.32)", "rgba(255,255,255,0.1)", "rgba(255,255,255,0.05)"] as const;

/**
 * Pensamento no feed como cartão de vidro escuro (refeito em 27/11 com referência no material "thick" da Apple e nas
 * superfícies do Obsidian): camada quase opaca e neutra, borda de luz fina, um reflexo leve no alto e nenhuma cor no
 * vidro; a cor da pasta fica só no número e no ponto. No mouse por cima, a borda clareia e o cartão sobe um pouco.
 */
export const PostCard = memo(function PostCard({ post }: { post: PostCardData; author?: string; avatar?: string | null; featured?: boolean }) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const lit = useAnimatedStyle(() => ({ opacity: Math.max(hover.value, press.value) }));
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * hover.value }] }));
  const category = post.categories[0];
  // A cor da pasta (legível sobre o preto) marca o número: diferencia os pensamentos sem imagem.
  const accent = readableAccent(category?.color ?? colors.violet400);
  return (
    <Animated.View style={lift}>
      <Touchable
        accessibilityRole="link"
        accessibilityLabel={post.title}
        onPressIn={(event) => markOrigin(event.nativeEvent.pageY)}
        onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: post.slug } })}
        hover={hover}
        press={press}
        pressScale={0.985}
        style={[styles.card, webGlass]}
      >
        <LinearGradient pointerEvents="none" colors={RIM} start={{ x: 0.15, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, lit]}>
          <LinearGradient colors={RIM_LIT} start={{ x: 0.15, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <View pointerEvents="none" style={styles.body} />
        <LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.045)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.45 }} style={styles.sheen} />
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
    </Animated.View>
  );
});

/** Mesma silhueta do pensamento, enquanto o feed carrega (a lista não "salta" ao chegar). */
export function PostCardSkeleton() {
  return (
    <View style={[styles.card, { gap: space.sm }]}>
      <View pointerEvents="none" style={styles.body} />
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
  card: { paddingVertical: space.lg + 2, paddingHorizontal: space.lg + 4, borderRadius: 20, overflow: "hidden" },
  // Corpo do vidro: 1 px para dentro, deixando a borda de luz à mostra; escuro e neutro (material "thick").
  body: { position: "absolute", top: 1, left: 1, right: 1, bottom: 1, borderRadius: 19, backgroundColor: "rgba(13,12,17,0.84)" },
  sheen: { position: "absolute", top: 1, left: 1, right: 1, height: "55%", borderTopLeftRadius: 19, borderTopRightRadius: 19 },
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
