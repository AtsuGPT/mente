import { Children, Fragment, useEffect, useState, type ReactNode } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { useAuth } from "@/lib/auth";
import { api as accountApi } from "@/lib/api";
import { API_SOURCE, API_URL } from "@/lib/config";
import { useCurrentEnvironment } from "@/lib/environment";
import { EnvironmentHeader, goToEnvironments, ROLE_LABEL } from "@/components/environment-header";
import { EnvironmentGlyph } from "@/components/environment-glyph";
import { AppText, Button, Touchable } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatHandle } from "@/lib/format";
import { colors, fonts, radius, space, tint } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";

const ROLE_HINT: Record<string, string> = {
  OWNER: "Você é o proprietário: controla tudo, inclusive participantes e configurações.",
  ADMIN: "Você administra o conteúdo e os participantes que o proprietário permitir.",
  MEMBER: "Você lê, publica e edita os próprios pensamentos.",
  VIEWER: "Você lê os pensamentos, inclusive os privados.",
  GUEST: "Você está como visitante: só os pensamentos públicos.",
  DEV: "Acesso de dev da plataforma: você lê tudo, inclusive o privado e as conversas com a Kally, sem publicar nem alterar nada.",
};

/** Linha de uma seção: ícone num quadrado discreto, rótulo, dica e seta. */
function Row({ icon, label, hint, href, onPress, tone = "default" }: { icon: IconName; label: string; hint?: string; href?: Href; onPress?: () => void; tone?: "default" | "danger" }) {
  const danger = tone === "danger";
  return (
    <Touchable accessibilityRole="button" onPress={onPress ?? (() => href && router.push(href))} pressScale={0.985} style={styles.row}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Icon name={icon} size={17} color={danger ? colors.danger : colors.violet300} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <AppText variant="uiMedium" color={danger ? colors.danger : colors.text}>{label}</AppText>
        {hint ? <AppText variant="small" color={colors.faint}>{hint}</AppText> : null}
      </View>
      {danger ? null : (
        <View style={{ transform: [{ rotate: "180deg" }] }}>
          <Icon name="back" size={15} color={colors.faint} />
        </View>
      )}
    </Touchable>
  );
}

/** Seção agrupada: rótulo pequeno e as linhas num só cartão, separadas por fios. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  if (!rows.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="label" color={colors.faint} style={styles.sectionTitle}>{title}</AppText>
      <View style={styles.group}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={styles.separator} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/** Tudo o que esta pessoa pode fazer no ambiente atual, mais a conta e a conexão. */
export default function EnvironmentTab() {
  const container = useContainer("form");
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { api, environment, permissions, role, session } = useCurrentEnvironment();
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
    <ScrollView contentContainerStyle={[{ paddingTop: insets.top + space.md, paddingBottom: space.xxxl, gap: space.xl }, container]}>
      <EnvironmentHeader title="Ambiente" />

      {/* O ambiente: marca, nome, papel e acesso. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <EnvironmentGlyph color={environment.color} icon={environment.icon} image={session.image} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="heading" numberOfLines={2}>{environment.name}</AppText>
            <View style={styles.badges}>
              <View style={styles.badge}><AppText variant="label" color={colors.violet200} style={styles.badgeText}>{ROLE_LABEL[role] ?? role}</AppText></View>
              <View style={[styles.badge, styles.badgeNeutral]}>
                <Icon name={environment.guestAccess ? "globe" : "lock"} size={11} color={colors.muted} />
                <AppText variant="label" color={colors.muted} style={styles.badgeText} accessibilityLabel={environment.guestAccess ? "Aberto a visitantes" : "Privado: só participantes"}>{environment.guestAccess ? "Aberto a visitantes" : "Só participantes"}</AppText>
              </View>
            </View>
          </View>
        </View>
        {environment.description ? <AppText color={colors.muted}>{environment.description}</AppText> : null}
        <AppText variant="small" color={colors.faint}>{ROLE_HINT[role]}</AppText>
      </View>

      <Section title="Neste ambiente">
        <Row icon="folder" label="Pastas" href="/pastas" />
        <Row icon="doc" label={environment.id === "mente" ? "Sobre o Minha Mente" : `Sobre ${environment.name}`} href="/sobre" />
        {role !== "GUEST" ? <Row icon="users" label="Participantes" hint={permissions.manageMembers ? "Convites, papéis e permissões" : undefined} href="/painel/participantes" /> : null}
      </Section>

      {canWrite || permissions.manageSettings ? (
        <Section title="Gestão">
          {canWrite ? <Row icon="edit" label={permissions.manageContent ? "Pensamentos" : "Meus pensamentos"} href="/painel" /> : null}
          {permissions.manageContent ? <Row icon="folder" label="Categorias" href="/painel/categorias" /> : null}
          {permissions.manageSettings ? <Row icon="settings" label="Configurações do ambiente" hint="Nome, aparência, acesso e arquivamento" href="/painel/configuracoes" /> : null}
        </Section>
      ) : null}

      <Section title="Ambientes">
        <Row icon="swap" label="Trocar de ambiente" onPress={goToEnvironments} />
        {role !== "GUEST" && role !== "DEV" && role !== "OWNER" ? <Row icon="logout" label="Sair deste ambiente" onPress={leave} tone="danger" /> : null}
      </Section>

      <View style={{ gap: space.sm }}>
        <AppText variant="label" color={colors.faint} style={styles.sectionTitle}>Conta</AppText>
        {user ? (
          <>
            <View style={styles.group}>
              <View style={styles.account}>
                <View style={styles.initial}>
                  <AppText style={styles.initialText}>{user.displayName.trim().charAt(0).toUpperCase() || "?"}</AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="uiMedium" numberOfLines={1}>{user.displayName}</AppText>
                  <AppText variant="small" color={colors.faint} numberOfLines={1}>{formatHandle(user.username)}</AppText>
                </View>
              </View>
              {baseEnabled ? (
                <>
                  <View style={styles.separator} />
                  <Row icon="doc" label="Base de documentos da Kally" hint="PDFs, artigos e notas que a Kally consulta só para você" href="/base" />
                </>
              ) : null}
            </View>
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
        <AppText variant="label" color={colors.faint} style={styles.sectionTitle}>Conexão</AppText>
        <View style={[styles.group, styles.connection]}>
          <AppText variant="small" color={colors.faint}>Servidor ({API_SOURCE})</AppText>
          <AppText variant="small" color={colors.muted} selectable>{API_URL}</AppText>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: colors.surface },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: tint.selected, borderWidth: StyleSheet.hairlineWidth, borderColor: tint.selectedBorder },
  badgeNeutral: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: colors.lineStrong },
  badgeText: { fontSize: 10, lineHeight: 13, letterSpacing: 0.8 },
  sectionTitle: { paddingHorizontal: space.xs },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: colors.surface, overflow: "hidden" },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: space.md + 32 + space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 56 },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: tint.selected },
  rowIconDanger: { backgroundColor: "rgba(242,119,122,0.12)" },
  account: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  initial: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.violet950, borderWidth: 1, borderColor: "rgba(165,139,247,0.35)" },
  initialText: { fontFamily: fonts.serifMedium, fontSize: 18, lineHeight: 22, color: colors.violet200 },
  connection: { padding: space.md, gap: 2 },
});
