import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { downloadKallyFile } from "@/lib/artifact-file";
import { useEnvironment } from "@/lib/environment";
import { feedback } from "@/lib/feedback";
import { colors, panels, radius, space } from "@/theme/tokens";

export type KallyFile = { id: string; name: string; format: "pdf" | "md" | "html"; bytes: number; pages: number | null };

const LABEL = { pdf: "PDF", md: "Markdown", html: "Página HTML" } as const;

/** Arquivo que a Kally gerou nesta resposta (o servidor já criou e conferiu): um toque baixa. */
export function KallyFileCard({ file }: { file: KallyFile }) {
  const env = useEnvironment();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const size = file.bytes >= 1024 * 1024 ? `${(file.bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(file.bytes / 1024))} KB`;
  const download = async () => {
    const environmentId = env.current?.session.environment.id;
    if (!environmentId || busy) return;
    feedback.tap();
    setBusy(true);
    setNote(null);
    try {
      await downloadKallyFile(environmentId, file.id, file.name);
      setNote("Baixado.");
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Não consegui baixar o arquivo.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Touchable onPress={download} disabled={busy} pressScale={0.98} accessibilityRole="button" accessibilityLabel={`Baixar ${file.name}`} style={styles.card}>
      <View style={styles.icon}>{busy ? <ActivityIndicator size="small" color={colors.violet300} /> : <Icon name="doc" size={18} color={colors.violet300} />}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" numberOfLines={1}>{file.name}</AppText>
        <AppText variant="small" color={colors.muted}>{[LABEL[file.format], file.pages ? `${file.pages} ${file.pages === 1 ? "página" : "páginas"}` : null, size].filter(Boolean).join(" · ")}</AppText>
        {note ? <AppText variant="small" color={colors.violet300}>{note}</AppText> : null}
      </View>
      <AppText variant="small" color={colors.violet300}>Baixar</AppText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: panels.stage, borderWidth: StyleSheet.hairlineWidth, borderColor: panels.border },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.violet950 },
});
