import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { useAuth } from "@/lib/auth";
import { api as accountApi } from "@/lib/api";
import { API_SOURCE, API_URL } from "@/lib/config";
import { useCurrentEnvironment } from "@/lib/environment";
import { EnvironmentHeader, goToEnvironments } from "@/components/environment-header";
import { AppText, Button, SectionLabel, Touchable } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatHandle } from "@/lib/format";
import { colors, elevation, radius, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";

const ROLE_HINT: Record<string, string> = {
  OWNER: "Você é o proprietário: controla tudo, inclusive participantes e configurações.",
  ADMIN: "Você administra o conteúdo e os participantes que o proprietário permitir.",
  MEMBER: "Você lê, publica e edita os próprios pensamentos.",
  VIEWER: "Você lê os pensamentos, inclusive os privados.",
  GUEST: "Você está como visitante: só os pensamentos públicos.",
  DEV: "Acesso de dev da plataforma: você lê tudo, inclusive o privado e as conversas com a Kally, sem publicar nem alterar nada.",
};

function Row({ icon, label, hint, href, onPress }: { icon: IconName; label: string; hint?: string; href?: Href; onPress?: () => void }) {
  return (
    <Touchable accessibilityRole="button" onPress={onPress ?? (() => href && router.push(href))} style={styles.row}>
      <View style={styles.rowIcon}><Icon name={icon} size={19} color={colors.violet300} /></View>
      <View style={{ flex: 1 }}>
        <AppText variant="uiMedium">{label}</AppText>
        {hint ? <AppText variant="small" color={colors.faint}>{hint}</AppText> : null}
      </View>
      <View style={{ transform: [{ rotate: "180deg" }] }}>
        <Icon name="back" size={16} color={colors.faint} />
      </View>
    </Touchable>
  );
}

/** Tudo o que esta pessoa pode fazer no ambiente atual, mais a conta e a conexão. */
export default function EnvironmentTab() {
  const container = useContainer("form");
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { api, environment, permissions, role } = useCurrentEnvironment();
  const canWrite = permissions.publish || permissions.manageContent;
  // A base de documentos aparece quando a Kally desta pessoa a consulta (o servidor decide).
  const [baseEnabled, setBaseEnabled] = useState(false);
  useEffect(() => {
    if (!user) return setBaseEnabled(false);
    accountApi.kallyDocuments().then((r) => setBaseEnabled(r.enabled || r.documents.length > 0), () => setBaseEnabled(false));
  }, [user]);

  function leave() {
    Alert.alert(`Sair de ${environment.name}?`, "Você deixa de participar e precisará de um novo convite para voltar.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair do ambiente",
        style: "destructive",
        onPress: async () => {
          try {
            await api.leave();
            goToEnvironments();
          } catch (cause) {
            Alert.alert(environment.name, cause instanceof Error ? cause.message : "Não foi possível sair.");
          }
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={[{ padding: space.lg, paddingTop: insets.top + space.md, paddingBottom: space.xxxl, gap: space.xl }, container]}>
      <EnvironmentHeader title="Ambiente" />

      <View style={styles.card}>
        {environment.description ? <AppText color={colors.muted}>{environment.description}</AppText> : null}
        <AppText variant="small" color={colors.violet200}>{ROLE_HINT[role]}</AppText>
        <AppText variant="small" color={colors.faint}>{environment.guestAccess ? "Aberto a visitantes (só os pensamentos públicos)." : "Privado: só participantes."}</AppText>
      </View>

      <View style={{ gap: space.sm }}>
        <SectionLabel>Neste ambiente</SectionLabel>
        <Row icon="folder" label="Pastas" href="/pastas" />
        <Row icon="doc" label={environment.id === "mente" ? "Sobre o Minha Mente" : `Sobre ${environment.name}`} href="/sobre" />
        {role !== "GUEST" ? <Row icon="users" label="Participantes" hint={permissions.manageMembers ? "Convites, papéis e permissões" : undefined} href="/painel/participantes" /> : null}
      </View>

      {canWrite || permissions.manageSettings ? (
        <View style={{ gap: space.sm }}>
          <SectionLabel>Gestão</SectionLabel>
          {canWrite ? <Row icon="edit" label={permissions.manageContent ? "Pensamentos" : "Meus pensamentos"} href="/painel" /> : null}
          {permissions.manageContent ? <Row icon="folder" label="Categorias" href="/painel/categorias" /> : null}
          {permissions.manageSettings ? <Row icon="settings" label="Configurações do ambiente" hint="Nome, aparência, acesso e arquivamento" href="/painel/configuracoes" /> : null}
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <SectionLabel>Ambientes</SectionLabel>
        <Row icon="swap" label="Trocar de ambiente" onPress={goToEnvironments} />
        {role !== "GUEST" && role !== "DEV" && role !== "OWNER" ? <Row icon="logout" label="Sair deste ambiente" onPress={leave} /> : null}
      </View>

      <View style={{ gap: space.sm }}>
        <SectionLabel>Conta</SectionLabel>
        {user ? (
          <>
            <View style={styles.card}>
              <AppText variant="uiMedium">{user.displayName}</AppText>
              <AppText variant="small" color={colors.faint}>{formatHandle(user.username)}</AppText>
            </View>
            {baseEnabled ? <Row icon="doc" label="Base de documentos da Kally" hint="PDFs, artigos e notas que a Kally consulta só para você" href="/base" /> : null}
            <Button
              label="Sair da conta"
              icon="logout"
              variant="danger"
              onPress={() =>
                Alert.alert("Sair da conta?", "Você voltará à central de ambientes.", [
                  { text: "Cancelar", style: "cancel" },
                  { text: "Sair", style: "destructive", onPress: () => { goToEnvironments(); void signOut(); } },
                ])
              }
            />
          </>
        ) : (
          <Button label="Entrar ou criar conta" onPress={() => router.push("/login")} />
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <SectionLabel>Conexão</SectionLabel>
        <View style={styles.card}>
          <AppText variant="small" color={colors.muted}>Servidor ({API_SOURCE})</AppText>
          <AppText variant="uiMedium" selectable>{API_URL}</AppText>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.glass, gap: space.xs, ...elevation.card },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, paddingVertical: space.md + 2, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass, ...elevation.card },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.violet800, borderWidth: 1, borderColor: colors.violet600 },
});
