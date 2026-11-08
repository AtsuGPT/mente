import { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, Share, StyleSheet, Switch, View } from "react-native";
import { useCurrentEnvironment } from "@/lib/environment";
import { formatDateShort, formatHandle } from "@/lib/format";
import type { Invite, Member, MemberRole } from "@/lib/types";
import { AppText, Button, Chip, SectionLabel, StateView, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";

const ROLE_LABEL: Record<MemberRole, string> = { OWNER: "Proprietário", ADMIN: "Administrador", MEMBER: "Membro", VIEWER: "Leitor" };
const FLAGS = [
  { key: "canPublish", perm: "publish", label: "Publicar" },
  { key: "canEditOwn", perm: "editOwn", label: "Editar os próprios" },
  { key: "canManageContent", perm: "manageContent", label: "Gerenciar todo o conteúdo" },
  { key: "canManageMembers", perm: "manageMembers", label: "Gerenciar participantes" },
] as const;

/** Participantes, papéis, permissões e convites do ambiente. O servidor confere cada ação. */
export default function MembersScreen() {
  const container = useContainer("form");
  const { api, environment, role: myRole, permissions } = useCurrentEnvironment();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const canManage = permissions.manageMembers;

  const load = useCallback(async () => {
    try {
      const result = await api.members();
      setMembers(result.members);
      if (canManage) setInvites((await api.invites()).invites);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar.");
    }
  }, [api, canManage]);
  useEffect(() => {
    void load();
  }, [load]);

  /** Espelha a regra do servidor só para não oferecer o que ele vai recusar. */
  function manageable(member: Member) {
    if (!canManage || member.role === "OWNER") return false;
    if (myRole === "OWNER") return true;
    return member.role === "MEMBER" || member.role === "VIEWER";
  }
  const assignable: MemberRole[] = myRole === "OWNER" ? ["ADMIN", "MEMBER", "VIEWER"] : ["MEMBER", "VIEWER"];

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await load();
    } catch (cause) {
      Alert.alert(environment.name, cause instanceof Error ? cause.message : "Não foi possível concluir.");
    }
  }

  if (!members) return <StateView loading={!error} error={error} onRetry={() => void load()} />;

  return (
    <ScrollView
      contentContainerStyle={[{ padding: space.lg, gap: space.lg, paddingBottom: space.xxxl }, container]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.violet400} />}
    >
      <SectionLabel>{`${members.length} ${members.length === 1 ? "participante" : "participantes"}`}</SectionLabel>
      {members.map((member) => {
        const editable = manageable(member);
        const expanded = open === member.userId;
        return (
          <View key={member.userId} style={[styles.card, expanded && { borderColor: colors.violet700 }]}>
            <Touchable onPress={() => editable && setOpen(expanded ? null : member.userId)} style={styles.memberRow} disabled={!editable}>
              <View style={styles.avatar}><AppText variant="uiMedium" color={colors.violet200}>{member.user.displayName.slice(0, 1).toUpperCase()}</AppText></View>
              <View style={{ flex: 1 }}>
                <AppText variant="uiMedium" numberOfLines={1}>{member.user.displayName}</AppText>
                <AppText variant="small" color={colors.faint}>{formatHandle(member.user.username)} · desde {formatDateShort(member.createdAt)}</AppText>
              </View>
              <View style={styles.rolePill}><AppText variant="label" color={colors.violet200} style={{ fontSize: 11, letterSpacing: 1 }}>{ROLE_LABEL[member.role]}</AppText></View>
              {editable ? <Icon name={expanded ? "close" : "edit"} size={16} color={colors.faint} /> : null}
            </Touchable>

            {expanded ? (
              <View style={{ gap: space.md, marginTop: space.md }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {assignable.map((r) => (
                    <Chip key={r} label={ROLE_LABEL[r]} selected={member.role === r} onPress={() => void run(() => api.updateMember(member.userId, { role: r }))} />
                  ))}
                </View>
                {FLAGS.filter((f) => f.key !== "canManageMembers" || myRole === "OWNER").map((flag) => (
                  <View key={flag.key} style={styles.flagRow}>
                    <AppText style={{ flex: 1 }}>{flag.label}</AppText>
                    {member[flag.key] !== null ? <AppText variant="label" color={colors.violet300} style={{ fontSize: 11, letterSpacing: 1 }}>Ajustado</AppText> : null}
                    <Switch
                      value={member.permissions[flag.perm]}
                      onValueChange={(value) => void run(() => api.updateMember(member.userId, { [flag.key]: value }))}
                      trackColor={{ true: colors.violet600, false: colors.lineStrong }}
                      thumbColor={colors.text}
                    />
                  </View>
                ))}
                <Button
                  label="Voltar ao padrão do papel"
                  variant="ghost"
                  compact
                  onPress={() => void run(() => api.updateMember(member.userId, { canPublish: null, canEditOwn: null, canManageContent: null, ...(myRole === "OWNER" ? { canManageMembers: null } : {}) }))}
                />
                <Button
                  label="Remover do ambiente"
                  variant="danger"
                  compact
                  onPress={() =>
                    Alert.alert(`Remover ${member.user.displayName}?`, "A pessoa perde o acesso; os pensamentos dela continuam no ambiente.", [
                      { text: "Cancelar", style: "cancel" },
                      { text: "Remover", style: "destructive", onPress: () => void run(() => api.removeMember(member.userId)) },
                    ])
                  }
                />
              </View>
            ) : null}
          </View>
        );
      })}

      {canManage ? <InvitesSection invites={invites} assignable={assignable} onChange={load} /> : null}
    </ScrollView>
  );
}

function inviteStatus(invite: Invite) {
  if (invite.revokedAt) return { text: "Revogado", color: colors.faint };
  if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) return { text: "Expirado", color: colors.faint };
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return { text: "Esgotado", color: colors.faint };
  return { text: "Ativo", color: colors.success };
}

function InvitesSection({ invites, assignable, onChange }: { invites: Invite[]; assignable: MemberRole[]; onChange: () => Promise<void> }) {
  const { api, environment } = useCurrentEnvironment();
  const [role, setRole] = useState<MemberRole>("VIEWER");
  const [maxUses, setMaxUses] = useState<number | null>(1);
  const [days, setDays] = useState<number | null>(7);
  const [busy, setBusy] = useState(false);

  async function share(invite: Invite) {
    await Share.share({ message: `Convite para ${environment.name} no Minha Mente.\nCódigo: ${invite.code}\n${invite.link}` }).catch(() => undefined);
  }

  async function create() {
    setBusy(true);
    try {
      const { invite } = await api.createInvite({ role, maxUses, expiresInDays: days });
      await onChange();
      await share(invite);
    } catch (cause) {
      Alert.alert(environment.name, cause instanceof Error ? cause.message : "Não foi possível criar o convite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.md, marginTop: space.lg }}>
      <SectionLabel>Convites</SectionLabel>
      <View style={styles.card}>
        <AppText variant="small" color={colors.muted}>Quem receber entra como:</AppText>
        <View style={styles.options}>{assignable.map((r) => <Chip key={r} label={ROLE_LABEL[r]} selected={role === r} onPress={() => setRole(r)} />)}</View>
        <AppText variant="small" color={colors.muted}>Usos:</AppText>
        <View style={styles.options}>
          {([1, 10, null] as const).map((n) => <Chip key={String(n)} label={n === null ? "Ilimitado" : n === 1 ? "1 pessoa" : `${n} pessoas`} selected={maxUses === n} onPress={() => setMaxUses(n)} />)}
        </View>
        <AppText variant="small" color={colors.muted}>Validade:</AppText>
        <View style={styles.options}>
          {([1, 7, 30, null] as const).map((d) => <Chip key={String(d)} label={d === null ? "Sem prazo" : d === 1 ? "1 dia" : `${d} dias`} selected={days === d} onPress={() => setDays(d)} />)}
        </View>
        <Button label="Gerar e compartilhar convite" icon="share" loading={busy} onPress={() => void create()} style={{ marginTop: space.sm }} />
      </View>

      {invites.map((invite) => {
        const status = inviteStatus(invite);
        const active = status.text === "Ativo";
        return (
          <View key={invite.id} style={[styles.card, styles.inviteRow, !active && { opacity: 0.6 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="uiMedium" selectable style={{ letterSpacing: 1.5 }}>{invite.code}</AppText>
              <AppText variant="small" color={colors.faint}>
                {ROLE_LABEL[invite.role]} · {invite.uses}/{invite.maxUses ?? "∞"} usos{invite.expiresAt ? ` · até ${formatDateShort(invite.expiresAt)}` : ""}
              </AppText>
              <AppText variant="label" color={status.color} style={{ fontSize: 11, letterSpacing: 1 }}>{status.text}</AppText>
            </View>
            {active ? (
              <>
                <Touchable accessibilityLabel="Compartilhar convite" onPress={() => void share(invite)} style={styles.iconBtn}><Icon name="share" size={18} color={colors.violet300} /></Touchable>
                <Touchable
                  accessibilityLabel="Revogar convite"
                  onPress={() =>
                    Alert.alert("Revogar convite?", "O código deixa de funcionar; quem já entrou continua participando.", [
                      { text: "Cancelar", style: "cancel" },
                      { text: "Revogar", style: "destructive", onPress: async () => { await api.revokeInvite(invite.id).catch(() => undefined); await onChange(); } },
                    ])
                  }
                  style={styles.iconBtn}
                >
                  <Icon name="trash" size={18} color={colors.danger} />
                </Touchable>
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: space.sm },
  memberRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.violet900, borderWidth: 1, borderColor: colors.violet700 },
  rolePill: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.violet950, borderWidth: 1, borderColor: colors.violet800 },
  flagRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
});
