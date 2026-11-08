import { memo, useId, useState } from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { useDialogKeyboard } from "@/lib/use-dialog-keyboard";
import { enter, exit, layoutTransition } from "@/theme/motion";
import { colors, radius, space } from "@/theme/tokens";
import { DiagramSurface, type SurfaceResult } from "./diagram-surface";
import { FIT_MAX_HEIGHT } from "@/lib/structured";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/**
 * Diagrama Mermaid no meio do texto: desenhado numa caixa isolada, ajustado à largura da tela,
 * com tela cheia (aproximar e arrastar) e o código à mão. Enquanto o bloco ainda chega pelo
 * streaming, mostra só um aviso discreto (desenhar pela metade daria erro a cada pedaço).
 * Se o desenho falhar (sintaxe inválida, sem conexão), o código aparece: nada se perde.
 */
export const Diagram = memo(function Diagram({ source, complete = true }: { source: string; complete?: boolean }) {
  const id = `d${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [result, setResult] = useState<SurfaceResult | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [full, setFull] = useState(false);
  const insets = useSafeAreaInsets();
  useDialogKeyboard(full, () => setFull(false));

  if (!complete) {
    return (
      <View style={styles.frame} accessibilityLabel="Diagrama sendo escrito">
        <View style={styles.head}>
          <Icon name="flow" size={15} color={colors.violet300} />
          <AppText variant="label" color={colors.faint} style={{ flex: 1 }}>Diagrama</AppText>
          <ActivityIndicator size="small" color={colors.violet300} />
        </View>
        <AppText style={styles.pending} numberOfLines={4}>{source.split("\n").slice(-4).join("\n")}</AppText>
      </View>
    );
  }

  const failed = result?.type === "error";
  const height = result?.type === "ok" ? Math.min(Math.max(result.height, 80), FIT_MAX_HEIGHT + 24) : 200;

  return (
    <Animated.View layout={layoutTransition} style={styles.frame}>
      <View style={styles.head}>
        <Icon name="flow" size={15} color={failed ? colors.danger : colors.violet300} />
        <AppText variant="label" color={colors.faint} style={{ flex: 1 }}>{failed ? "Diagrama (não desenhado)" : "Diagrama"}</AppText>
        <Touchable accessibilityLabel={showCode ? "Esconder o código do diagrama" : "Ver o código do diagrama"} onPress={() => setShowCode((v) => !v)} hitSlop={8} style={[styles.action, showCode && styles.actionOn]}>
          <AppText variant="small" color={showCode ? colors.violet200 : colors.muted}>Código</AppText>
        </Touchable>
        {!failed ? (
          <Touchable accessibilityLabel="Abrir o diagrama em tela cheia" onPress={() => setFull(true)} hitSlop={8} pressScale={0.9} style={styles.icon}>
            <Icon name="expand" size={15} color={colors.muted} />
          </Touchable>
        ) : null}
      </View>

      {failed ? (
        <AppText variant="small" color={colors.danger} style={styles.error}>{result.message.startsWith("Sem conexão") ? result.message : "Não consegui desenhar este diagrama. O código está abaixo."}</AppText>
      ) : (
        <View style={{ height }}>
          <DiagramSurface source={source} id={id} fit height={height} onResult={setResult} />
          {!result ? (
            <View style={[StyleSheet.absoluteFill, styles.loading]} pointerEvents="none">
              <ActivityIndicator color={colors.violet300} />
            </View>
          ) : null}
        </View>
      )}

      {showCode || failed ? (
        <Animated.View entering={enter.fade} exiting={exit.fade}>
          <ScrollView horizontal style={styles.code} contentContainerStyle={{ padding: space.md }}>
            <AppText selectable style={styles.codeText}>{source}</AppText>
          </ScrollView>
        </Animated.View>
      ) : null}

      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)} statusBarTranslucent>
        <View style={[styles.full, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.fullHead}>
            <Icon name="flow" size={16} color={colors.violet300} />
            <AppText variant="uiMedium" style={{ flex: 1 }}>Diagrama</AppText>
            <AppText variant="small" color={colors.faint}>Aproxime e arraste</AppText>
            <Touchable accessibilityLabel="Fechar tela cheia" onPress={() => setFull(false)} hitSlop={8} pressScale={0.9} style={styles.icon}>
              <Icon name="close" size={18} color={colors.text} />
            </Touchable>
          </View>
          {full ? <DiagramSurface source={source} id={`${id}full`} fit={false} height="fill" onResult={() => undefined} /> : null}
        </View>
      </Modal>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  frame: { marginBottom: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: colors.surface, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  action: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  actionOn: { borderColor: "rgba(165,139,247,0.38)", backgroundColor: "rgba(132,97,240,0.16)" },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  loading: { alignItems: "center", justifyContent: "center" },
  pending: { fontFamily: mono, fontSize: 12, lineHeight: 18, color: colors.faint, padding: space.md },
  error: { paddingHorizontal: space.md, paddingTop: space.md },
  code: { margin: space.md, marginTop: space.sm, borderRadius: radius.md, backgroundColor: "#07060A", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  codeText: { fontFamily: mono, fontSize: 12.5, lineHeight: 19, color: colors.violet200 },
  full: { flex: 1, backgroundColor: colors.bg },
  fullHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});

