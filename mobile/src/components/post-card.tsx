import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { readableAccent } from "@shared/color";
import type { Category, PostCard as PostCardData } from "@/lib/types";
import { formatDateShort, formatNumber } from "@/lib/format";
import { AppText, Skeleton, Touchable } from "./ui/primitives";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { colors, fonts, radius, space } from "@/theme/tokens";

export function CategoryTag({ category, onPress }: { category: Category; onPress?: () => void }) {
  return (
    <Touchable onPress={onPress} disabled={!onPress} hitSlop={6} style={styles.tag}>
      <View style={[styles.dot, { backgroundColor: category.color }]} />
      <AppText variant="label" color={readableAccent(category.color)}>{category.name}</AppText>
    </Touchable>
  );
}

export function Avatar({ src, size = 36 }: { src?: string | null; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {src ? (
        <Image source={{ uri: src }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <AppText style={{ fontFamily: fonts.serif, fontSize: size * 0.45, color: colors.violet300 }}>K</AppText>
      )}
    </View>
  );
}

export const PostCard = memo(function PostCard({ post, author, avatar }: { post: PostCardData; author: string; avatar?: string | null }) {
  const accent = post.categories[0]?.color ?? colors.violet600;
  // Destaque sutil: a borda clareia com o mouse por cima (web) e ao pressionar.
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const surface = useAnimatedStyle(() => ({
    borderColor: interpolateColor(Math.max(hover.value, press.value), [0, 1], [colors.line, colors.lineStrong]),
    backgroundColor: interpolateColor(press.value, [0, 1], [colors.surface, colors.surfaceRaised]),
  }));
  return (
    <Touchable
      accessibilityRole="link"
      accessibilityLabel={post.title}
      onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: post.slug } })}
      hover={hover}
      press={press}
      pressScale={0.985}
      style={[styles.card, surface]}
    >
      <View style={[styles.edge, { backgroundColor: accent }]} />
      <View style={styles.meta}>
        <Avatar src={avatar} size={32} />
        <AppText variant="small" color={colors.muted} style={{ flex: 1 }} numberOfLines={1}>
          <AppText variant="small" style={{ fontFamily: fonts.sansSemibold }}>{author}</AppText>
          {"  ·  "}
          {formatDateShort(post.publishedAt)}
        </AppText>
        <AppText variant="label" color={colors.faint}>Nº {formatNumber(post.number)}</AppText>
      </View>

      <AppText variant="title" style={styles.title}>{post.title}</AppText>
      {post.excerpt ? (
        <AppText variant="body" color={colors.muted} numberOfLines={4} style={styles.excerpt}>{post.excerpt}</AppText>
      ) : null}

      {post.categories.length ? (
        <View style={styles.tags}>
          {post.categories.map((category) => (
            <CategoryTag
              key={category.id}
              category={category}
              onPress={() => router.push({ pathname: "/categoria/[slug]", params: { slug: category.slug } })}
            />
          ))}
        </View>
      ) : null}
    </Touchable>
  );
});

/** Mesma silhueta do cartão, enquanto o feed carrega (a lista não "salta" ao chegar). */
export function PostCardSkeleton() {
  return (
    <Animated.View style={[styles.card, { gap: space.sm }]} aria-hidden>
      <View style={styles.meta}>
        <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
        <Skeleton style={{ width: 140, height: 12 }} />
      </View>
      <Skeleton style={{ marginTop: space.sm, width: "72%", height: 22 }} />
      <Skeleton style={{ width: "100%", height: 14 }} />
      <Skeleton style={{ width: "88%", height: 14 }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg + 2,
    overflow: "hidden",
  },
  edge: { position: "absolute", left: 0, top: space.lg, bottom: space.lg, width: 2, borderRadius: 1 },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { marginTop: space.md, fontSize: 23, lineHeight: 29 },
  excerpt: { marginTop: space.sm, fontSize: 16, lineHeight: 25 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.lg, marginTop: space.md },
  tag: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.violet950,
    borderWidth: 1,
    borderColor: colors.violet800,
  },
});
