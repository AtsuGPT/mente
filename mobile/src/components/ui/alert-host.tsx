import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Modal, Platform, Pressable, StyleSheet, View, type AlertButton } from "react-native";
import Animated from "react-native-reanimated";
import { registerAlertHost, type AlertRequest } from "@/lib/alert";
import { useDialogKeyboard } from "@/lib/use-dialog-keyboard";
import { enter } from "@/theme/motion";
import { colors, radius, space } from "@/theme/tokens";
import { AppText, Button } from "./primitives";

/**
 * Diálogo de confirmação e aviso da web (o Alert do React Native não existe no navegador).
 * Acessível: papel alertdialog com título e descrição ligados, foco no botão seguro ao abrir
 * (Cancelar, quando houver), Esc cancela, clique fora cancela só quando existe um Cancelar.
 * Uma fila garante que avisos seguidos apareçam um de cada vez.
 */
export function AlertHost() {
  const [queue, setQueue] = useState<AlertRequest[]>([]);
  useEffect(() => (Platform.OS === "web" ? registerAlertHost((request) => setQueue((current) => [...current, request])) : undefined), []);
  const current = queue[0] ?? null;
  const cancel = current?.buttons.find((button) => button.style === "cancel");

  const close = (button?: AlertButton) => {
    setQueue((items) => items.slice(1));
    // Depois de fechar: a ação pode abrir outro diálogo ou navegar.
    setTimeout(() => button?.onPress?.(), 0);
  };
  useDialogKeyboard(!!current, () => close(cancel ?? (current?.buttons.length === 1 ? current.buttons[0] : undefined)));

  const safe = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (!current || Platform.OS !== "web") return;
    const timer = setTimeout(() => {
      const node = safe.current as unknown as HTMLElement | null;
      node?.querySelector<HTMLElement>("[role=button], button")?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  // Ordem visual: cancelar primeiro, ação principal por último (como no iOS e na web).
  const ordered = [...current.buttons].sort((a, b) => (a.style === "cancel" ? -1 : 0) - (b.style === "cancel" ? -1 : 0));
  const safeIndex = ordered.findIndex((button) => button.style === "cancel");

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(cancel)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Fechar" disabled={!cancel} onPress={() => close(cancel)} />
        <Animated.View
          entering={enter.rise}
          style={styles.card}
          role="alertdialog"
          aria-modal
          aria-labelledby="mm-alert-title"
          aria-describedby={current.message ? "mm-alert-message" : undefined}
        >
          <AppText variant="heading" nativeID="mm-alert-title" accessibilityRole="header">{current.title}</AppText>
          {current.message ? <AppText nativeID="mm-alert-message" color={colors.muted} style={{ marginTop: space.sm }}>{current.message}</AppText> : null}
          <View style={styles.actions}>
            {ordered.map((button, index) => (
              <View key={`${button.text}-${index}`} ref={index === (safeIndex >= 0 ? safeIndex : ordered.length - 1) ? safe : undefined} style={styles.action}>
                <Button
                  label={button.text ?? "OK"}
                  compact
                  variant={button.style === "destructive" ? "danger" : button.style === "cancel" ? "secondary" : "primary"}
                  onPress={() => close(button)}
                />
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: "rgba(0,0,0,0.72)" },
  card: { width: "100%", maxWidth: 420, padding: space.xl, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: colors.surfaceRaised },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: space.sm, marginTop: space.xl },
  action: { flexGrow: 1, flexBasis: 120 },
});
