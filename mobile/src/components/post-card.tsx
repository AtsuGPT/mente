import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { readableAccent } from "@shared/color";
import type { Category, PostCard as PostCardData } from "@/lib/types";
import { formatDateShort, formatNumber } from "@/lib/format";
import { AppText, Touchable } from "./ui/primitives";
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
  return (
    <Touchable
      accessibilityRole="link"
      accessibilityLabel={post.title}
      onPress={() => router.push({ pathname: "/post/[slug]", params: { slug: post.slug } })}
      style={styles.card}
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
