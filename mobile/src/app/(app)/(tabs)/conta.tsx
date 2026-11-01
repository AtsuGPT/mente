import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { useAuth } from "@/lib/auth";
import { API_SOURCE, API_URL } from "@/lib/config";
import { Avatar } from "@/components/post-card";
import { AppText, Button, SectionLabel, Touchable } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icon";
import { colors, radius, space } from "@/theme/tokens";

const roleLabel = { CONVIDADO: "Convidado", INTIMO: "Leitor", ADMIN: "Administrador" } as const;
const roleHint = {
  CONVIDADO: "Você vê os pensamentos públicos.",
  INTIMO: "Você também vê os pensamentos privados.",
  ADMIN: "Você pode escrever, editar e organizar o arquivo.",
} as const;

function Row({ icon, label, href }: { icon: IconName; label: string; href: Href }) {
  return (
    <Touchable onPress={() => router.push(href)} style={styles.row}>
      <Icon name={icon} size={20} color={colors.violet300} />
      <AppText variant="uiMedium" style={{ flex: 1 }}>{label}</AppText>
      <View style={{ transform: [{ rotate: "180deg" }] }}>
        <Icon name="back" size={16} color={colors.faint} />
      </View>
    </Touchable>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { session, role, isAdmin, signOut } = useAuth();

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, gap: space.xl }}>
      <View style={styles.profile}>
        <Avatar src={session?.profileImage} size={64} />
        <View style={{ flex: 1 }}>
          <AppText variant="title">{session?.site.name ?? "Minha Mente"}</AppText>
          {role ? (
            <>
              <AppText variant="label" color={colors.violet300} style={{ marginTop: space.xs }}>{roleLabel[role]}</AppText>
              <AppText variant="small" color={colors.muted}>{roleHint[role]}</AppText>
            </>
          ) : null}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <SectionLabel>Arquivo</SectionLabel>
        <Row icon="folder" label="Pastas" href="/pastas" />
        <Row icon="doc" label="Sobre o Minha Mente" href="/sobre" />
      </View>

      {isAdmin ? (
        <View style={{ gap: space.sm }}>
          <SectionLabel>Administração</SectionLabel>
          <Row icon="edit" label="Pensamentos" href="/painel" />
          <Row icon="folder" label="Categorias" href="/painel/categorias" />
          <Row icon="settings" label="Configurações" href="/painel/configuracoes" />
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <SectionLabel>Conexão</SectionLabel>
        <View style={styles.server}>
          <AppText variant="small" color={colors.muted}>Servidor ({API_SOURCE})</AppText>
          <AppText variant="uiMedium" selectable>{API_URL}</AppText>
        </View>
      </View>

      <Button
        label="Sair"
        icon="logout"
        variant="danger"
        onPress={() =>
          Alert.alert("Sair do Minha Mente?", "Você precisará entrar novamente.", [
            { text: "Cancelar", style: "cancel" },
            { text: "Sair", style: "destructive", onPress: () => void signOut() },
          ])
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  server: { padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: space.xs },
});
