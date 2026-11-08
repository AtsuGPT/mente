import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useDialogKeyboard } from "@/lib/use-dialog-keyboard";
import { useLayout } from "@/theme/layout";
import { spring, timing } from "@/theme/motion";
import { colors, gradients, radius, space } from "@/theme/tokens";

/**
 * Folha (celular) ou diálogo centralizado (telas largas), com o mesmo comportamento em
 * todo o app:
 *  - entra com mola (sobe do fim da tela / cresce de 96% no diálogo), sem rebote visível;
 *  - sai acelerando e só então desmonta (nada some de repente);
 *  - fundo escurece junto com o progresso;
 *  - no celular, arrastar a alça para baixo fecha (soltar antes do limiar volta com mola);
 *  - Esc fecha e o foco entra/volta na web (useDialogKeyboard);
 *  - com campos, desvia do teclado.
 */
export function Sheet({
  visible,
  onClose,
  children,
  keyboard = false,
  maxWidth = 520,
  style,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Tem campos de texto: desvia do teclado. */
  keyboard?: boolean;
  maxWidth?: number;
  /** Aparência da superfície (cor, borda, espaçamento). */
  style?: StyleProp<ViewStyle>;
}) {
  const { dialog, height } = useLayout();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const sheetHeight = useSharedValue(Math.round(height * 0.6));

  useDialogKeyboard(visible, onClose);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    progress.value = withTiming(0, timing.exit, (finished) => {
      if (finished) scheduleOnRN(setMounted, false);
    });
  }, [visible, progress]);

  useEffect(() => {
    if (!mounted || !visible) return;
    drag.value = 0;
    progress.value = withSpring(1, spring.sheet);
  }, [mounted, visible, progress, drag]);

  const pan = usePanGesture({
    enabled: !dialog,
    activeOffsetY: 8,
    failOffsetX: [-24, 24],
    onUpdate: (event) => {
      "worklet";
      // Para cima resiste (um terço), para baixo acompanha o dedo.
      drag.value = event.translationY > 0 ? event.translationY : event.translationY / 3;
    },
    onDeactivate: (event) => {
      "worklet";
      if (event.translationY > Math.min(140, sheetHeight.value * 0.35) || event.velocityY > 900) {
        scheduleOnRN(onClose);
      } else {
        drag.value = withSpring(0, spring.release);
      }
    },
  });

  const backdrop = useAnimatedStyle(() => ({
    opacity: progress.value * interpolate(drag.value, [0, sheetHeight.value], [1, 0.35], Extrapolation.CLAMP),
  }));

  const surface = useAnimatedStyle(() => {
    if (dialog) {
      return { opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 12 }, { scale: 0.96 + progress.value * 0.04 }] };
    }
    const offscreen = sheetHeight.value + 40;
    return { transform: [{ translateY: (1 - progress.value) * offscreen + drag.value }] };
  });

  if (!mounted) return null;

  const onLayout = (event: LayoutChangeEvent) => {
    sheetHeight.value = event.nativeEvent.layout.height;
  };

  const body = (
    <Animated.View
      onLayout={onLayout}
      accessibilityViewIsModal
      style={[
        styles.surface,
        dialog
          ? { width: "100%", maxWidth, maxHeight: Math.round(height * 0.88), borderRadius: radius.xl, borderWidth: 1 }
          : { width: "100%", maxHeight: Math.round(height * 0.92), paddingBottom: insets.bottom + space.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1 },
        style,
        surface,
      ]}
    >
      <LinearGradient pointerEvents="none" colors={gradients.surfaceRaised} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient pointerEvents="none" colors={["rgba(199,183,250,0)", "rgba(199,183,250,0.45)", "rgba(199,183,250,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sheen} />
      {dialog ? null : (
        <GestureDetector gesture={pan}>
          <View style={styles.handleArea} accessibilityLabel="Arraste para baixo para fechar">
            <View style={styles.grabber} />
          </View>
        </GestureDetector>
      )}
      {children}
    </Animated.View>
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={[styles.frame, dialog ? styles.frameDialog : styles.frameSheet]}
          behavior={keyboard && Platform.OS !== "web" ? "padding" : undefined}
          enabled={keyboard}
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
            {/* Fora da ordem de foco: no teclado, Esc fecha; o foco vai direto para o conteúdo. */}
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" focusable={false} tabIndex={-1} />
          </Animated.View>
          {body}
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  frameSheet: { justifyContent: "flex-end", alignItems: "center" },
  frameDialog: { justifyContent: "center", alignItems: "center", padding: space.xl },
  backdrop: { backgroundColor: "rgba(6,2,16,0.7)" },
  surface: { backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, padding: space.lg, paddingTop: space.sm, overflow: "hidden" },
  sheen: { position: "absolute", left: 0, right: 0, top: 0, height: 1 },
  handleArea: { alignSelf: "stretch", alignItems: "center", paddingVertical: space.sm, marginTop: -space.xs, marginBottom: space.xs },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.violet700 },
});
