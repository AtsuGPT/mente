import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { diagramHtml, readDiagramMessage } from "@/lib/structured";

export type SurfaceResult = { type: "ok"; height: number; width: number } | { type: "error"; message: string };

/**
 * Celular: o diagrama é desenhado numa WebView isolada (o Mermaid precisa de um navegador).
 * Só a página inicial carrega; qualquer navegação a partir dela é bloqueada.
 */
export function DiagramSurface({ source, id, fit, height, onResult }: { source: string; id: string; fit: boolean; height: number | "fill"; onResult: (result: SurfaceResult) => void }) {
  const html = useMemo(() => ({ html: diagramHtml({ source, id, fit }) }), [source, id, fit]);
  return (
    <WebView
      source={html}
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={(request: { url: string }): boolean => request.url === "about:blank" || request.url.startsWith("data:")}
      onMessage={(event: WebViewMessageEvent): void => {
        const result = readDiagramMessage(event.nativeEvent.data, id);
        if (result) onResult(result);
      }}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      allowsLinkPreview={false}
      setSupportMultipleWindows={false}
      scrollEnabled={!fit}
      bounces={false}
      showsHorizontalScrollIndicator={!fit}
      showsVerticalScrollIndicator={!fit}
      overScrollMode="never"
      opaque={false}
      style={[styles.web, height === "fill" ? styles.fill : { height }]}
      containerStyle={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  web: { backgroundColor: "transparent" },
  fill: { flex: 1 },
  container: { backgroundColor: "transparent" },
});
