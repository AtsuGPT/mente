import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useCurrentEnvironment } from "@/lib/environment";
import { EnvironmentGlyph } from "./environment-glyph";
import { AppText, Touchable } from "./ui/primitives";
import { Icon } from "./ui/icon";
import { colors, radius, space } from "@/theme/tokens";

const ROLE_LABEL: Record<string, string> = { OWNER: "Proprietário", ADMIN: "Administrador", MEMBER: "Membro", VIEWER: "Leitor", GUEST: "Visitante" };

/** Volta à central de ambientes; ela fecha o ambiente atual ao aparecer. */
export function goToEnvironments() {
  router.dismissTo("/");
}

/** Cabeçalho das abas: deixa claro em que ambiente se está e permite trocar. */
export function EnvironmentHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { environment, role, session } = useCurrentEnvironment();
  return (
    <View style={styles.row}>
      <Touchable accessibilityRole="button" accessibilityLabel={`Trocar de ambiente (atual: ${environment.name})`} onPress={goToEnvironments} haptic style={styles.switcher}>
        <EnvironmentGlyph color={environment.color} icon={environment.icon} image={session.image} size={38} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.violet300} numberOfLines={1}>
            {environment.name} · {ROLE_LABEL[role] ?? role}
          </AppText>
          <AppText variant="title" numberOfLines={1} style={{ fontSize: 22, lineHeight: 28 }}>{title ?? environment.name}</AppText>
          {subtitle ? <AppText variant="small" color={colors.faint} numberOfLines={1}>{subtitle}</AppText> : null}
        </View>
        <View style={styles.swap}>
          <Icon name="swap" size={16} color={colors.violet300} />
        </View>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  switcher: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md },
  swap: { width: 34, height: 34, borderRadius: radius.md, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.violet950, alignItems: "center", justifyContent: "center" },
});
