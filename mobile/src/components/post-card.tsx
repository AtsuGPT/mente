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
import { colors, fonts, gradients, radius, space } from "@/theme/tokens";

export function CategoryTag({ category, onPress }: { category: Category; onPress?: () => void }) {
  return (
    <Touchable onPress={onPress} disabled={!onPress} hitSlop={6} pressScale={0.94} style={[styles.tag, { borderColor: `${category.color}55` }]}>
      <View style={[styles.dot, { backgroundColor: category.color }]} />
      <AppText variant="label" color={readableAccent(category.color)} style={{ fontSize: 11 }}>{category.name}</AppText>
    </Touchable>
  );
}

export function Avatar({ src, size = 36 }: { src?: string | null; size?: number }) {
  return (
    <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, padding: 1.5 }}>
      <View style={[styles.avatar, { borderRadius: size / 2 }]}>
        {src ? (
          <Image source={{ uri: src }} style={{ width: size - 3, height: size - 3 }} contentFit="cover" />
        ) : (
          <AppText style={{ fontFamily: fonts.serif, fontSize: size * 0.45, color: colors.violet200 }}>K</AppText>
        )}
      </View>
    </LinearGradient>
  );
}

/**
 * Cartão de pensamento: superfície em camadas com borda em gradiente; a cor da pasta aparece
 * como uma faixa luminosa à esquerda e num brilho no canto. Pressionar acende a borda.
 */
export const PostCard = memo(function PostCard({ post, author, avatar }: { post: PostCardData; author: string; avatar?: string | null }) {
  const accent = post.categories[0]?.color ?? colors.violet500;
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const lit = useAnimatedStyle(() => ({ opacity: Math.max(hover.value * 0.6, press.value) }));
  return (
    <Touchable
      accessibilityRole="link"
      accessibilityLabel={post.title}
      onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: post.slug } })}
      hover={hover}
      press={press}
      pressScale={0.98}
    >
      <Surface elevated contentStyle={styles.card}>
        <LinearGradient colors={[`${accent}38`, `${accent}00`]} locations={[0, 0.6]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <LinearGradient colors={[accent, `${accent}10`]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.edge} />
        <View style={styles.meta}>
          <Avatar src={avatar} size={32} />
          <View style={{ flex: 1 }}>
            <AppText variant="small" style={{ fontFamily: fonts.sansSemibold }} numberOfLines={1}>{author}</AppText>
            <AppText variant="small" color={colors.faint} numberOfLines={1}>{formatDateShort(post.publishedAt)}</AppText>
          </View>
          <View style={styles.number}>
            <AppText variant="label" color={colors.violet200} style={{ fontSize: 11 }}>Nº {formatNumber(post.number)}</AppText>
          </View>
        </View>

        <AppText variant="title" style={styles.title}>{post.title}</AppText>
        {post.excerpt ? (
          <AppText variant="body" color={colors.muted} numberOfLines={3} style={styles.excerpt}>{post.excerpt}</AppText>
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
        <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
        <Skeleton style={{ width: 140, height: 12 }} />
      </View>
      <Skeleton style={{ marginTop: space.sm, width: "72%", height: 24 }} />
      <Skeleton style={{ width: "100%", height: 14 }} />
      <Skeleton style={{ width: "88%", height: 14 }} />
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.lg + 2, paddingHorizontal: space.lg + 4 },
  edge: { position: "absolute", left: 0, top: space.lg, bottom: space.lg, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  lit: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.violet400 },
  meta: { flexDirection: "row", alignItems: "center", gap: space.md },
  number: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: "rgba(98,54,212,0.22)", borderWidth: 1, borderColor: colors.violet800 },
  title: { marginTop: space.md, fontSize: 24, lineHeight: 30 },
  excerpt: { marginTop: space.sm, fontSize: 16, lineHeight: 25 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, backgroundColor: "rgba(21,16,38,0.6)" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  avatar: { flex: 1, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.violet950 },
});
