import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useCurrentEnvironment } from "@/lib/environment";
import { EnvironmentGlyph } from "./environment-glyph";
import { AppText, Touchable } from "./ui/primitives";
import { Icon } from "./ui/icon";
import { DashboardButton } from "./left-dashboard";
import { colors, gradients, radius, space } from "@/theme/tokens";

export const ROLE_LABEL: Record<string, string> = { OWNER: "Proprietário", ADMIN: "Administrador", MEMBER: "Membro", VIEWER: "Leitor", GUEST: "Visitante", DEV: "Dev" };

/** Volta à central de ambientes; ela fecha o ambiente atual ao aparecer. */
export function goToEnvironments() {
  router.dismissTo("/");
}

/**
 * Cabeçalho das abas: título grande em serifa; acima, o ambiente (marca, nome e papel) num
 * botão de vidro que leva à central para trocar de ambiente.
 */
export function EnvironmentHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { environment, role, session } = useCurrentEnvironment();
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
      <DashboardButton />
      <Touchable accessibilityRole="button" accessibilityLabel={`Trocar de ambiente (atual: ${environment.name})`} onPress={goToEnvironments} haptic pressScale={0.97} style={styles.chip}>
        <LinearGradient colors={gradients.border} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.chipBorder]} />
        <View style={styles.chipBody}>
          <EnvironmentGlyph color={environment.color} icon={environment.icon} image={session.image} size={24} />
          <AppText variant="label" color={colors.violet200} numberOfLines={1} style={{ flexShrink: 1 }}>
            {environment.name}
          </AppText>
          <AppText variant="label" color={colors.faint} numberOfLines={1}>· {ROLE_LABEL[role] ?? role}</AppText>
          <Icon name="swap" size={13} color={colors.violet300} />
        </View>
      </Touchable>
      </View>
      <AppText variant="hero" numberOfLines={2} style={styles.title} accessibilityRole="header">
        {title ?? environment.name}
      </AppText>
      {subtitle ? <AppText variant="small" color={colors.muted} numberOfLines={2}>{subtitle}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm },
  chip: { alignSelf: "flex-start", flexShrink: 1, borderRadius: radius.pill },
  chipBorder: { borderRadius: radius.pill },
  chipBody: { flexDirection: "row", alignItems: "center", gap: space.sm, margin: 1, paddingLeft: 4, paddingRight: space.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.glass, maxWidth: 320 },
  title: { marginTop: 2 },
});
