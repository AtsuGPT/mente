import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEnvironment } from "@/lib/environment";
import type { EnvironmentCard, InvitePreview } from "@/lib/types";
import { EnvironmentGlyph, withAlpha } from "@/components/environment-glyph";
import { NeuralBrain } from "@/components/neural-brain";
import { AppText, Button, SectionLabel, StateView, TextField, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { formatHandle } from "@/lib/format";
import { colors, fonts, radius, space } from "@/theme/tokens";

const ROLE_LABEL: Record<string, string> = { OWNER: "Proprietário", ADMIN: "Administrador", MEMBER: "Membro", VIEWER: "Leitor", GUEST: "Visitante" };

/** Central de ambientes: a primeira tela. Escolher um ambiente pede login quando ele exige. */
export default function EnvironmentsScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut, state } = useAuth();
  const { current, enter, exit, pending, setPending, lastEnvironmentId } = useEnvironment();
  const [data, setData] = useState<{ mine: EnvironmentCard[]; open: EnvironmentCard[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const resuming = useRef(false);
  // O grupo (app) só existe depois que o ambiente entra no estado: navega no efeito abaixo.
  const navigateWhenReady = useRef(false);

  useEffect(() => {
    if (current && navigateWhenReady.current) {
      navigateWhenReady.current = false;
      router.push("/feed");
    }
  }, [current]);

  const load = useCallback(async () => {
    try {
      setData(await api.environments());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os ambientes.");
    }
  }, []);

  // Ao aparecer, a central fecha o ambiente aberto (é assim que se troca de ambiente:
  // o grupo (app) é desmontado e nada do anterior fica na tela) e recarrega a lista.
  useFocusEffect(
    useCallback(() => {
      if (!navigateWhenReady.current) exit();
      void load();
    }, [load, exit]),
  );

  const open = useCallback(
    async (id: string, name: string) => {
      setOpening(id);
      try {
        navigateWhenReady.current = true;
        await enter(id);
      } catch (cause) {
        navigateWhenReady.current = false;
        if (cause instanceof ApiError && cause.status === 401) {
          // Ambiente privado e sem conta: guarda a intenção e pede o login.
          setPending({ kind: "environment", id, name });
          router.push("/login");
        } else {
          Alert.alert(name, cause instanceof Error ? cause.message : "Não foi possível abrir este ambiente.");
        }
      } finally {
        setOpening(null);
      }
    },
    [enter, setPending],
  );

  // Depois do login, retoma o que a pessoa queria abrir (ambiente ou convite).
  useEffect(() => {
    if (!user || !pending || resuming.current) return;
    resuming.current = true;
    const target = pending;
    setPending(null);
    void (async () => {
      try {
        if (target.kind === "invite") {
          const result = await api.redeemInvite(target.code);
          await load();
          await open(result.environmentId, target.name);
        } else {
          await open(target.id, target.name);
        }
      } catch (cause) {
        Alert.alert(target.name, cause instanceof Error ? cause.message : "Não foi possível continuar.");
      } finally {
        resuming.current = false;
      }
    })();
  }, [user, pending, setPending, load, open]);

  const notice = state.status === "ready" ? state.notice : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View pointerEvents="none" style={styles.glow} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl, paddingHorizontal: space.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.violet400} />}
      >
        <Animated.View entering={FadeIn.duration(500)} style={styles.brandRow}>
          <NeuralBrain width={92} />
          <View style={{ flex: 1 }}>
            <AppText variant="label" color={colors.violet300}>Plataforma de ambientes</AppText>
            <AppText variant="title" style={{ marginTop: 2 }}>
              Minha <AppText variant="title" style={{ fontFamily: fonts.serifItalic, color: colors.violet200 }}>Mente</AppText>
            </AppText>
          </View>
        </Animated.View>

        <View style={styles.account}>
          {user ? (
            <>
              <View style={styles.avatar}><AppText variant="uiMedium" color={colors.violet200}>{user.displayName.slice(0, 1).toUpperCase()}</AppText></View>
              <View style={{ flex: 1 }}>
                <AppText variant="uiMedium" numberOfLines={1}>{user.displayName}</AppText>
                <AppText variant="small" color={colors.faint} numberOfLines={1}>{formatHandle(user.username)}</AppText>
              </View>
              <Touchable
                accessibilityRole="button"
                onPress={() => Alert.alert("Sair da conta?", "Você continuará vendo os ambientes abertos a visitantes.", [{ text: "Cancelar", style: "cancel" }, { text: "Sair", style: "destructive", onPress: () => void signOut() }])}
                style={styles.accountAction}
              >
                <Icon name="logout" size={18} color={colors.muted} />
              </Touchable>
            </>
          ) : (
            <>
              <AppText color={colors.muted} style={{ flex: 1 }}>Entre para ver seus ambientes privados.</AppText>
              <Button label="Entrar" compact onPress={() => router.push("/login")} />
            </>
          )}
        </View>

        {notice ? <AppText variant="small" color={colors.warning} style={{ marginTop: space.sm }}>{notice}</AppText> : null}

        {!data ? (
          <StateView loading={!error} error={error} onRetry={() => void load()} />
        ) : (
          <>
            {user ? (
              <Section title="Seus ambientes" empty="Você ainda não participa de nenhum ambiente. Adicione um com um convite ou crie o seu.">
                {data.mine.map((env, index) => (
                  <EnvironmentTile key={env.id} env={env} index={index} last={env.id === lastEnvironmentId} busy={opening === env.id} onPress={() => void open(env.id, env.name)} />
                ))}
              </Section>
            ) : null}

            {data.open.length ? (
              <Section title="Abertos a visitantes">
                {data.open.map((env, index) => (
                  <EnvironmentTile key={env.id} env={env} index={index + data.mine.length} last={env.id === lastEnvironmentId} busy={opening === env.id} onPress={() => void open(env.id, env.name)} />
                ))}
              </Section>
            ) : null}
          </>
        )}

        <View style={styles.actions}>
          <Button label="Adicionar ambiente" icon="key" variant="secondary" onPress={() => setAdding(true)} />
          {user ? (
            <Button label="Criar ambiente" icon="plus" onPress={() => router.push("/ambiente-novo")} />
          ) : (
            <Button label="Criar conta" variant="ghost" onPress={() => router.push("/cadastro")} />
          )}
        </View>
      </ScrollView>

      <AddEnvironmentSheet
        visible={adding}
        onClose={() => setAdding(false)}
        signedIn={!!user}
        onAccepted={async (environmentId, name) => {
          setAdding(false);
          await load();
          await open(environmentId, name);
        }}
        onNeedLogin={(code, name) => {
          setAdding(false);
          setPending({ kind: "invite", code, name });
          router.push("/login");
        }}
      />
    </View>
  );
}

function Section({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <View style={{ marginTop: space.xxl, gap: space.md }}>
      <SectionLabel>{title}</SectionLabel>
      {items.length ? children : empty ? <AppText color={colors.muted} style={{ lineHeight: 22 }}>{empty}</AppText> : null}
    </View>
  );
}

function EnvironmentTile({ env, index, last, busy, onPress }: { env: EnvironmentCard; index: number; last: boolean; busy: boolean; onPress: () => void }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(380)}>
      <Touchable accessibilityRole="button" accessibilityLabel={`Abrir ${env.name}`} onPress={onPress} disabled={busy} haptic style={[styles.tile, { borderColor: withAlpha(env.color, 0.28) }]}>
        <View pointerEvents="none" style={[styles.tileWash, { backgroundColor: withAlpha(env.color, 0.06) }]} />
        <EnvironmentGlyph color={env.color} icon={env.icon} image={env.image} size={54} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <AppText variant="heading" numberOfLines={1} style={{ flexShrink: 1 }}>{env.name}</AppText>
            {last ? <View style={styles.lastDot} /> : null}
          </View>
          {env.description ? <AppText variant="small" color={colors.muted} numberOfLines={2}>{env.description}</AppText> : null}
          <View style={styles.meta}>
            <View style={styles.rolePill}><AppText variant="label" color={colors.violet200} style={{ fontSize: 10 }}>{ROLE_LABEL[env.role] ?? env.role}</AppText></View>
            <AppText variant="small" color={colors.faint}>
              {env.stats.posts} {env.stats.posts === 1 ? "pensamento" : "pensamentos"} · {env.stats.members} {env.stats.members === 1 ? "pessoa" : "pessoas"}
            </AppText>
            {env.archivedAt ? <AppText variant="label" color={colors.warning} style={{ fontSize: 10 }}>Arquivado</AppText> : null}
          </View>
        </View>
        <View style={{ transform: [{ rotate: "180deg" }], opacity: busy ? 0.3 : 1 }}>
          <Icon name="back" size={16} color={colors.faint} />
        </View>
      </Touchable>
    </Animated.View>
  );
}

/** Folha para adicionar um ambiente por código ou link: confere o convite antes de aceitar. */
function AddEnvironmentSheet({
  visible,
  onClose,
  signedIn,
  onAccepted,
  onNeedLogin,
}: {
  visible: boolean;
  onClose: () => void;
  signedIn: boolean;
  onAccepted: (environmentId: string, name: string) => Promise<void>;
  onNeedLogin: (code: string, name: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setInput("");
      setPreview(null);
      setError("");
    }
  }, [visible]);

  async function check() {
    if (!input.trim()) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      setPreview(await api.previewInvite(input.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível verificar o convite.");
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!preview) return;
    if (!signedIn) return onNeedLogin(preview.code, preview.environment.name);
    setBusy(true);
    setError("");
    try {
      const result = await api.redeemInvite(preview.code);
      await onAccepted(result.environmentId, preview.environment.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível aceitar o convite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.grabber} />
        <AppText variant="title">Adicionar ambiente</AppText>
        <AppText color={colors.muted} style={{ marginTop: space.xs }}>Cole o link ou digite o código que você recebeu.</AppText>
        <TextField
          value={input}
          onChangeText={(value) => {
            setInput(value);
            setPreview(null);
            setError("");
          }}
          placeholder="ABCD-EFGH ou https://…/convite/ABCD-EFGH"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => void check()}
          containerStyle={{ marginTop: space.lg }}
        />
        {error ? <AppText variant="small" color={colors.danger} style={{ marginTop: space.sm }}>{error}</AppText> : null}
        {preview ? (
          <Animated.View entering={FadeIn.duration(220)} style={[styles.preview, { borderColor: withAlpha(preview.environment.color, 0.4) }]}>
            <EnvironmentGlyph color={preview.environment.color} icon={preview.environment.icon} size={46} />
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{preview.environment.name}</AppText>
              <AppText variant="small" color={colors.muted}>Convite como {ROLE_LABEL[preview.role]?.toLowerCase()}</AppText>
            </View>
          </Animated.View>
        ) : null}
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {preview ? (
            <Button label={signedIn ? "Aceitar e entrar" : "Entrar para aceitar"} icon="check" loading={busy} onPress={() => void accept()} />
          ) : (
            <Button label="Verificar convite" loading={busy} disabled={!input.trim()} onPress={() => void check()} />
          )}
          <Button label="Cancelar" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  glow: { position: "absolute", top: -160, left: -80, width: 420, height: 420, borderRadius: 210, backgroundColor: colors.violet950 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  account: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xl, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.violet900, borderWidth: 1, borderColor: colors.violet700 },
  accountAction: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  tile: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, paddingVertical: space.lg, borderRadius: radius.xl, borderWidth: 1, backgroundColor: colors.surface, overflow: "hidden" },
  tileWash: { ...StyleSheet.absoluteFill },
  lastDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.violet400 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
  rolePill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.violet950, borderWidth: 1, borderColor: colors.violet800 },
  actions: { marginTop: space.xxl, gap: space.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(5,4,9,0.6)" },
  sheet: { padding: space.xl, paddingTop: space.md, borderTopLeftRadius: radius.xl + 6, borderTopRightRadius: radius.xl + 6, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.violet800 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginBottom: space.lg },
  preview: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg, padding: space.md, borderRadius: radius.lg, borderWidth: 1, backgroundColor: colors.bg },
});
