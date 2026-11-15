import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { artifactHtml, readSurfaceMessage, type SurfaceMessage } from "@/lib/artifact";

/**
 * Celular: o artefato roda numa WebView isolada (incognito, sem arquivos, sem armazenamento). Só a página inicial
 * carrega; qualquer navegação a partir dela (link, redirecionamento) é bloqueada. A página não recebe nada do app; o app
 * só lê dela as mensagens da caixa (altura, pronto, erro), filtradas por readSurfaceMessage.
 */
export function ArtifactSurface({ source, id, height, scroll, onMessage }: { source: string; id: string; height: number | "fill"; scroll: boolean; onMessage: (message: SurfaceMessage) => void }) {
  const page = useMemo(() => ({ html: artifactHtml({ source, id }), baseUrl: "about:blank" }), [source, id]);
  return (
    <WebView
      source={page}
      originWhitelist={["about:blank", "about:srcdoc", "data:*"]}
      onShouldStartLoadWithRequest={(request: { url: string; isTopFrame?: boolean }): boolean => request.url === "about:blank" || request.url.startsWith("data:") || request.isTopFrame === false}
      onMessage={(event: WebViewMessageEvent): void => {
        const message = readSurfaceMessage(event.nativeEvent.data, id);
        if (message) onMessage(message);
      }}
      javaScriptEnabled
      domStorageEnabled={false}
      incognito
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      allowsLinkPreview={false}
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      mediaPlaybackRequiresUserAction
      scrollEnabled={scroll}
      bounces={false}
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
