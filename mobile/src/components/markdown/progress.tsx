import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { parseProgress, type ProgressStatus } from "@/lib/blocks";
import { colors, panels, radius, space } from "@/theme/tokens";

const STATUS_COLOR: Record<Exclude<ProgressStatus, null>, string> = { dominado: colors.success, dificuldade: colors.warning, estudando: colors.violet300 };
const STATUS_LABEL: Record<Exclude<ProgressStatus, null>, string> = { dominado: "dominado", dificuldade: "com dificuldade", estudando: "estudando" };

/**
 * Indicador de progresso (```progresso): plano de estudo com etapas, ou o progresso por assunto que o servidor monta
 * com os dados do banco (learning.ts). A barra conta as etapas marcadas [x].
 */
export function ProgressBlock({ source }: { source: string }) {
  const parsed = useMemo(() => parseProgress(source), [source]);
  if (!parsed) return null;
  const done = parsed.items.filter((i) => i.done).length;
  const total = parsed.items.length;
  const pct = Math.round((done / total) * 100);
  return (
    <View style={styles.box} accessibilityLabel={`${parsed.title || "Progresso"}: ${done} de ${total} concluídas`}>
      <View style={styles.head}>
        <AppText variant="body" style={styles.title}>{parsed.title || "Progresso"}</AppText>
        <AppText variant="small" color={colors.muted}>{`${done} de ${total}`}</AppText>
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.items}>
        {parsed.items.map((item, i) => (
          <View key={i} style={styles.item}>
            <View style={[styles.mark, item.done && styles.markDone]}>{item.done ? <Icon name="check" size={11} color={colors.bg} /> : null}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="body" color={item.done ? colors.text : colors.violet200}>{item.label}</AppText>
              {item.status || item.detail ? (
                <AppText variant="small" color={colors.muted}>
                  {item.status ? <AppText variant="small" color={STATUS_COLOR[item.status]}>{STATUS_LABEL[item.status]}</AppText> : null}
                  {item.status && item.detail ? " · " : ""}
                  {item.detail}
                </AppText>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, padding: space.md, marginBottom: space.lg, borderRadius: radius.lg, backgroundColor: panels.stage, borderWidth: StyleSheet.hairlineWidth, borderColor: panels.border },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  title: { fontWeight: "600" },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.lineStrong, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.violet500 },
  items: { gap: space.sm, marginTop: space.xs },
  item: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  mark: { width: 18, height: 18, marginTop: 2, borderRadius: 9, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  markDone: { backgroundColor: colors.success, borderColor: colors.success },
});
