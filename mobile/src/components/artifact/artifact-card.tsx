import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { KIND_INFO, kindOf } from "@/lib/artifact";
import { formatDateShort } from "@/lib/format";
import type { ArtifactCard as Card } from "@/lib/types";
import { colors, radius, space, tint } from "@/theme/tokens";

/** Cartão da biblioteca: tipo (ícone e cor), título, descrição, pasta, versão, quem criou e a estrela de favorito. */
export function ArtifactCard({ item, onToggleFavorite }: { item: Card; onToggleFavorite?: (item: Card) => void }) {
  const info = KIND_INFO[kindOf(item.kind)];
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`${info.label}: ${item.title}`}
      onPress={() => router.push({ pathname: "/artefato/[id]", params: { id: item.id } })}
      haptic
      pressScale={0.985}
      style={styles.card}
    >
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: `${info.color}1F`, borderColor: `${info.color}55` }]}>
          <Icon name={info.icon} size={18} color={info.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" color={colors.faint}>
            {info.label}
            {item.category ? ` · ${item.category}` : ""}
          </AppText>
          <AppText variant="heading" numberOfLines={2}>
            {item.title}
          </AppText>
        </View>
        {item.private ? <Icon name="lock" size={15} color={colors.faint} /> : null}
        {onToggleFavorite ? (
          <Touchable accessibilityLabel={item.favorite ? "Tirar dos favoritos" : "Favoritar"} onPress={() => onToggleFavorite(item)} hitSlop={10} pressScale={0.85} haptic style={styles.star}>
            <Icon name={item.favorite ? "starFilled" : "star"} size={18} color={item.favorite ? colors.warning : colors.faint} />
          </Touchable>
        ) : null}
      </View>
      {item.description ? (
        <AppText variant="small" color={colors.muted} numberOfLines={2}>
          {item.description}
        </AppText>
      ) : null}
      <AppText variant="small" color={colors.faint} numberOfLines={1}>
        v{item.version} · {item.author ? (item.author.isMe ? "você" : item.author.name) : "conta removida"} · {formatDateShort(item.updatedAt)}
      </AppText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  badge: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  star: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: tint.pressed },
});
