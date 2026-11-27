import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { router } from "expo-router";
import { formatAgo } from "@/lib/format";
import type { Category, KallyConversation, KallyLearningTopic } from "@/lib/types";
import { AppText, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { Surface } from "@/components/ui/surface";
import { colors, radius, space, tint } from "@/theme/tokens";

/**
 * A pasta como lugar do estudo (prévia aprovada em 27/11/2026): o progresso da própria pessoa nos tópicos da pasta, a
 * próxima revisão, os tópicos (tocar mostra onde ainda erra e abre uma conversa nova sobre ele, inclusive nos
 * dominados) e as conversas dela guardadas na pasta. Cada pessoa vê só o seu, mesmo numa pasta do ambiente inteiro.
 */
type Conversation = KallyConversation & { topics?: number };

const MASTERY: Record<KallyLearningTopic["mastery"], { label: string; color: string; border: string; bg: string }> = {
  dominado: { label: "dominado", color: colors.success, border: "rgba(143,221,176,0.35)", bg: "rgba(143,221,176,0.08)" },
  estudando: { label: "estudando", color: colors.violet300, border: tint.selectedBorder, bg: tint.selected },
  dificuldade: { label: "dificuldade", color: colors.warning, border: "rgba(232,192,125,0.35)", bg: "rgba(232,192,125,0.08)" },
};

/** "último quiz 2 de 5 · ontem", "explicado 2 vezes · há 3 dias", "2 quizzes · 9 de 10 · há 6 dias" */
export function topicMeta(t: KallyLearningTopic, now = new Date()) {
  const when = formatAgo(t.lastStudiedAt, now);
  if (t.mastery === "dominado" && t.quizzes >= 2) return `${t.quizzes} quizzes · ${t.correct} de ${t.questions} · ${when}`;
  if (t.quizzes && t.lastScore !== null) return `último quiz ${Math.round(t.lastScore * 100)}% · ${when}`;
  if (t.explanations) return `explicado ${t.explanations} ${t.explanations === 1 ? "vez" : "vezes"} · ${when}`;
  return when;
}

/** O tópico que mais pede revisão: o menor nextReviewAt (só os que já venceram ou vencem em até 3 dias). */
export function nextReviewOf(topics: KallyLearningTopic[], now = new Date()) {
  const soon = now.getTime() + 3 * 86_400_000;
  return topics
    .filter((t) => t.nextReviewAt && new Date(t.nextReviewAt).getTime() <= soon && t.mastery !== "dominado")
    .sort((a, b) => new Date(a.nextReviewAt!).getTime() - new Date(b.nextReviewAt!).getTime())[0] ?? null;
}

export type FolderConversation = Conversation;

/** Contagem por domínio (a barra do cabeçalho da pasta). */
export function masteryCounts(topics: KallyLearningTopic[]) {
  const counts = { dominado: 0, estudando: 0, dificuldade: 0 };
  for (const t of topics) counts[t.mastery] += 1;
  return counts;
}

export const MASTERY_STYLE = MASTERY;

export function FolderStudy({ category, topics, conversations }: { category: Category; topics: KallyLearningTopic[]; conversations: Conversation[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const openKally = (params: Record<string, string>) => router.push({ pathname: "/perguntar", params: { pasta: category.id, pastaNome: category.name, ...params } });
  const review = nextReviewOf(topics);

  return (
    <View style={{ gap: space.md }}>
      {topics.length ? (
        <>
          {review ? (
            <Touchable onPress={() => openKally({ topico: review.title })} style={styles.review} accessibilityLabel={`Revisar ${review.title}`}>
              <View style={styles.cal}>
                <AppText variant="label" color={colors.warning} style={{ fontSize: 10 }}>{new Date(review.nextReviewAt!).getTime() <= Date.now() ? "Hoje" : "Em breve"}</AppText>
                <Icon name="clock" size={18} color={colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="uiMedium">Revisar {review.title}</AppText>
                <AppText variant="small" color={colors.muted}>
                  {review.lastScore !== null ? `Último quiz: ${Math.round(review.lastScore * 100)}% de acerto.` : review.doubts ? `Você teve ${review.doubts} ${review.doubts === 1 ? "dúvida" : "dúvidas"} nesse assunto.` : "Hora de ver de novo para fixar."}
                </AppText>
              </View>
            </Touchable>
          ) : null}

          <View style={styles.sect}>
            <AppText variant="label" color={colors.faint}>Tópicos</AppText>
            <AppText variant="small" color={colors.faint}>{topics.length} · toque para ver onde ainda erra</AppText>
          </View>
          <Animated.View layout={LinearTransition} style={styles.list}>
            {topics.map((t, i) => {
              const isOpen = open === t.id;
              const m = MASTERY[t.mastery];
              return (
                <Animated.View key={t.id} layout={LinearTransition} style={[i < topics.length - 1 && styles.divider]}>
                  <Touchable onPress={() => setOpen(isOpen ? null : t.id)} style={styles.row} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} pressScale={0.99}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="uiMedium" numberOfLines={1}>{t.title}</AppText>
                      <AppText variant="small" color={colors.faint}>{topicMeta(t)}</AppText>
                    </View>
                    <View style={[styles.pill, { borderColor: m.border, backgroundColor: m.bg }]}>
                      <AppText variant="small" color={m.color} style={{ fontSize: 11.5 }}>{m.label}</AppText>
                    </View>
                    <Touchable onPress={() => openKally({ topico: t.title })} pressScale={0.92} hitSlop={6} style={styles.newChat} accessibilityLabel={`Nova conversa sobre ${t.title}`}>
                      <Icon name="plus" size={14} color={colors.violet200} />
                      <AppText variant="small" color={colors.violet200} style={{ fontSize: 12 }}>Nova conversa</AppText>
                    </Touchable>
                  </Touchable>
                  {isOpen ? (
                    <View style={styles.openArea}>
                      <AppText variant="label" color={colors.faint} style={{ fontSize: 11 }}>Onde ainda erra</AppText>
                      {(t.weakPoints.length ? t.weakPoints : [t.quizzes ? "Nenhum erro recente" : "Ainda sem quiz: faça um para medir o domínio"]).map((w, j) => (
                        <View key={j} style={styles.weak}>
                          <AppText variant="small" color={colors.muted}>{w}</AppText>
                        </View>
                      ))}
                      <Touchable onPress={() => openKally({ topico: t.title })} style={styles.study} accessibilityRole="button">
                        <Icon name="sparkle" size={15} color={colors.violet200} />
                        <AppText variant="uiMedium" color={colors.violet200} numberOfLines={1}>Nova conversa sobre {t.title}</AppText>
                      </Touchable>
                    </View>
                  ) : null}
                </Animated.View>
              );
            })}
          </Animated.View>
        </>
      ) : (
        <Surface contentStyle={{ padding: space.lg, gap: space.md, alignItems: "center" }}>
          <AppText color={colors.muted} style={{ textAlign: "center" }}>Ainda não há estudo nesta pasta. Converse com a Kally sobre o assunto e o progresso aparece aqui.</AppText>
          <Touchable onPress={() => openKally({})} style={[styles.study, { alignSelf: "stretch" }]} accessibilityRole="button">
            <Icon name="sparkle" size={15} color={colors.violet200} />
            <AppText variant="uiMedium" color={colors.violet200}>Começar a estudar com a Kally</AppText>
          </Touchable>
          <AppText variant="small" color={colors.faint}>a conversa já nasce nesta pasta</AppText>
        </Surface>
      )}

      {conversations.length ? (
        <>
          <View style={styles.sect}>
            <AppText variant="label" color={colors.faint}>Suas conversas</AppText>
            <AppText variant="small" color={colors.faint}>só você vê</AppText>
          </View>
          <View style={styles.list}>
            {conversations.map((c, i) => (
              <Touchable key={c.id} onPress={() => router.push({ pathname: "/perguntar", params: { conversa: c.id } })} style={[styles.row, i < conversations.length - 1 && styles.divider]} pressScale={0.99}>
                <Icon name="conversas" size={22} color={colors.muted} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="uiMedium" numberOfLines={1}>{c.title}</AppText>
                  <AppText variant="small" color={colors.faint}>
                    {[formatAgo(c.updatedAt), c.topics ? `${c.topics} ${c.topics === 1 ? "tópico" : "tópicos"}` : ""].filter(Boolean).join(" · ")}
                  </AppText>
                </View>
                <AppText color={colors.faint} style={{ fontSize: 18 }}>›</AppText>
              </Touchable>
            ))}
          </View>
        </>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  sumHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: space.md },
  bar: { flexDirection: "row", height: 8, gap: 3 },
  seg: { height: 8, borderRadius: 999 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.lg, marginTop: space.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  review: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(232,192,125,0.28)", backgroundColor: "rgba(232,192,125,0.05)" },
  cal: { width: 46, alignItems: "center", gap: 2, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: "rgba(232,192,125,0.35)" },
  sect: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: space.md, paddingHorizontal: 2 },
  list: { borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: colors.surface, overflow: "hidden" },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 13, paddingHorizontal: 14 },
  pill: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  openArea: { paddingHorizontal: 14, paddingBottom: 14, gap: 6 },
  weak: { paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: "rgba(232,192,125,0.45)" },
  study: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, marginTop: space.sm, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: tint.selectedBorder, backgroundColor: tint.selected },
  newChat: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: tint.selectedBorder, backgroundColor: tint.selected },
});
