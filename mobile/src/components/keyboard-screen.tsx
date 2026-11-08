import { createContext, useCallback, useContext, useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import { Dimensions, KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedKeyboard, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { timing } from "@/theme/motion";

/**
 * Mantém os campos acima do teclado, acompanhando a animação dele quadro a quadro.
 *
 * Telas cheias (celular): um espaçador no fim da tela cresce junto com o teclado, na UI
 * thread (useAnimatedKeyboard), em vez do KeyboardAvoidingView, que no Android com
 * edge-to-edge só ajustava depois que o teclado terminava de abrir (salto). A altura
 * descontada é só a parte do teclado que cobre esta tela (abaixo dela pode haver a barra
 * de abas). Quem precisa reagir (a lista do chat) lê o valor com useKeyboardInset().
 *
 * useAnimatedKeyboard está marcado como obsoleto no Reanimated 4 em favor do
 * react-native-keyboard-controller, que exigiria um módulo nativo novo (fora do Expo Go);
 * ele continua funcionando nesta versão, sem avisos.
 *
 * Web: o navegador do celular encolhe só a área visível (visualViewport); o espaçador
 * acompanha essa diferença. No computador fica em zero.
 *
 * modal: dentro de um Modal o teclado é medido em outra janela no Android; ali continua o
 * KeyboardAvoidingView (formulários curtos, sem lista para acompanhar).
 */

const KeyboardInsetContext = createContext<SharedValue<number> | null>(null);

/** Quanto do teclado cobre a tela atual (px), animado. Zero fora de um KeyboardScreen. */
export function useKeyboardInset(): SharedValue<number> {
  const fallback = useSharedValue(0);
  return useContext(KeyboardInsetContext) ?? fallback;
}

type Props = {
  header?: boolean;
  modal?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Recebe a altura coberta pelo teclado, para quem renderiza a tela (o provedor fica abaixo dele). */
  insetMirror?: SharedValue<number>;
  children: ReactNode;
};

export function KeyboardScreen(props: Props) {
  if (props.modal) return <ModalKeyboardScreen {...props} />;
  if (Platform.OS === "web") return <WebKeyboardScreen {...props} />;
  return <NativeKeyboardScreen {...props} />;
}

function useMirror(inset: SharedValue<number>, mirror?: SharedValue<number>) {
  useAnimatedReaction(
    () => inset.value,
    (value) => {
      if (mirror) mirror.value = value;
    },
  );
}

function NativeKeyboardScreen({ style, insetMirror, children }: Props) {
  const keyboard = useAnimatedKeyboard();
  const gap = useSharedValue(0);
  const ref = useRef<ComponentRef<typeof View>>(null);

  // Distância entre o fim desta tela e o fim da tela do aparelho (barra de abas, área segura).
  // O teclado é medido a partir do fim da tela física (edge-to-edge no Android).
  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _width, height) => {
      const screen = Dimensions.get(Platform.OS === "android" ? "screen" : "window").height;
      gap.value = Math.max(0, screen - (y + height));
    });
  }, [gap]);

  const inset = useDerivedValue(() => Math.max(0, keyboard.height.value - gap.value));
  useMirror(inset, insetMirror);
  const spacer = useAnimatedStyle(() => ({ height: inset.value }));

  return (
    <KeyboardInsetContext.Provider value={inset}>
      <View ref={ref} onLayout={measure} style={[{ flex: 1 }, style]}>
        {children}
        <Animated.View style={spacer} />
      </View>
    </KeyboardInsetContext.Provider>
  );
}

function WebKeyboardScreen({ style, insetMirror, children }: Props) {
  const inset = useSharedValue(0);
  useMirror(inset, insetMirror);

  useEffect(() => {
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    if (!viewport) return;
    const update = () => {
      const editing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
      // Pinça de zoom também encolhe a área visível: só conta com escala 1 e um campo em foco.
      const covered = editing && Math.abs(viewport.scale - 1) < 0.01 ? window.innerHeight - viewport.height - viewport.offsetTop : 0;
      inset.value = withTiming(covered > 80 ? covered : 0, timing.short);
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.removeEventListener("focusout", update);
    };
  }, [inset]);

  const spacer = useAnimatedStyle(() => ({ height: inset.value }));

  return (
    <KeyboardInsetContext.Provider value={inset}>
      <View style={[{ flex: 1 }, style]}>
        {children}
        <Animated.View style={spacer} />
      </View>
    </KeyboardInsetContext.Provider>
  );
}

function ModalKeyboardScreen({ header = false, style, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior={Platform.OS === "web" ? undefined : "padding"} keyboardVerticalOffset={header ? insets.top + 56 : 0}>
      {children}
    </KeyboardAvoidingView>
  );
}
