import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppText, Button, TextField, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import type { Category, KallyFolderChoice, KallyFolderPrompt } from "@/lib/types";
import { colors, radius, space, tint } from "@/theme/tokens";

/**
 * Cartão da pasta (pasta como centro): nasceu um tópico numa conversa sem pasta, ou a pessoa pediu para guardar.
 * Ela escolhe uma pasta do ambiente ou, se pode criar, uma nova com o nome já sugerido (editável). No sim, a conversa e
 * os tópicos dela vão para a pasta, e os próximos já nascem lá. "Agora não" vale para a conversa inteira; arrastar para
 * fechar só fecha (a Kally pode perguntar no próximo tópico novo).
 */
export function FolderSheet({
  prompt,
  onClose,
  onAnswer,
}: {
  prompt: KallyFolderPrompt | null;
  onClose: () => void;
  /** grava a escolha; devolve a pasta (ou null na recusa) */
  onAnswer: (prompt: KallyFolderPrompt, choice: KallyFolderChoice) => Promise<Category | null>;
}) {
  const [selected, setSelected] = useState<string | "nova" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"guardar" | "recusa" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { height } = useWindowDimensions();

  useEffect(() => {
    if (!prompt) return;
    // Sem pastas no ambiente, a pasta nova já vem escolhida (é a única saída).
    setSelected(prompt.folders.length ? null : prompt.canCreate ? "nova" : null);
    setName(prompt.suggestedName || prompt.topicTitle);
    setBusy(null);
    setError(null);
  }, [prompt]);

  if (!prompt) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const choice: KallyFolderChoice | null = selected === "nova" ? (name.trim() ? { kind: "nova", name: name.trim() } : null) : selected ? { kind: "existente", categoryId: selected } : null;
  const answer = async (value: KallyFolderChoice) => {
    setBusy(value.kind === "recusa" ? "recusa" : "guardar");
    setError(null);
    try {
      await onAnswer(prompt, value);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não consegui guardar agora. Tente de novo.");
      setBusy(null);
    }
  };

  return (
    <Sheet visible onClose={busy ? () => undefined : onClose} keyboard={selected === "nova"} style={{ gap: space.sm }}>
      <AppText variant="title">Guardar em uma pasta?</AppText>
      <AppText variant="small" color={colors.muted}>
        “{prompt.topicTitle}” e os próximos assuntos desta conversa ficam na pasta, com o seu progresso. Só você vê esta conversa.
      </AppText>
      <ScrollView style={{ maxHeight: Math.max(200, Math.round(height * 0.42)) }} contentContainerStyle={{ gap: space.xs }} keyboardShouldPersistTaps="handled">
        {prompt.folders.map((f) => (
          <Touchable key={f.id} onPress={() => setSelected(f.id)} style={[styles.row, selected === f.id && styles.rowOn]} accessibilityRole="radio" accessibilityState={{ selected: selected === f.id }}>
            <View style={[styles.dot, { backgroundColor: f.color }]} />
            <AppText variant="uiMedium" color={selected === f.id ? colors.violet200 : colors.text} style={{ flex: 1 }} numberOfLines={1}>{f.name}</AppText>
            {selected === f.id ? <Icon name="check" size={18} color={colors.violet300} /> : null}
          </Touchable>
        ))}
        {prompt.canCreate ? (
          <Touchable onPress={() => setSelected("nova")} style={[styles.row, selected === "nova" && styles.rowOn]} accessibilityRole="radio" accessibilityState={{ selected: selected === "nova" }}>
            <Icon name="plus" size={16} color={selected === "nova" ? colors.violet300 : colors.muted} />
            <AppText variant="uiMedium" color={selected === "nova" ? colors.violet200 : colors.text} style={{ flex: 1 }}>Nova pasta</AppText>
          </Touchable>
        ) : null}
        {selected === "nova" ? <TextField label="Nome da pasta" value={name} onChangeText={setName} maxLength={60} autoFocus selectTextOnFocus returnKeyType="done" onSubmitEditing={() => choice && void answer(choice)} /> : null}
        {!prompt.folders.length && !prompt.canCreate ? (
          <AppText variant="small" color={colors.faint}>Este ambiente ainda não tem pastas, e criar pastas é com quem gerencia o conteúdo.</AppText>
        ) : null}
      </ScrollView>
      {error ? <AppText variant="small" color={colors.danger}>{error}</AppText> : null}
      <View style={styles.actions}>
        <Button label="Guardar" icon="folder" compact disabled={!choice || busy === "recusa"} loading={busy === "guardar"} onPress={() => choice && void answer(choice)} />
        <Button label="Agora não" variant="secondary" compact disabled={busy === "guardar"} loading={busy === "recusa"} onPress={() => void answer({ kind: "recusa" })} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md },
  rowOn: { backgroundColor: tint.selected, borderWidth: StyleSheet.hairlineWidth, borderColor: tint.selectedBorder },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
});
