import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Mantém os campos acima do teclado. "padding" também no Android: com edge-to-edge
 * (padrão no Expo SDK 58) a janela não encolhe sozinha quando o teclado abre.
 * header: a tela tem cabeçalho de navegação; o deslocamento usa a área segura real
 * do aparelho (sobrar um pouco de espaço é melhor que o teclado cobrir o texto).
 */
export function KeyboardScreen({ header = false, style, children }: { header?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === "web" ? undefined : "padding"}
      keyboardVerticalOffset={header ? insets.top + 56 : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
