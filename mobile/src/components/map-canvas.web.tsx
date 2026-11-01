import { forwardRef, useEffect, useState, type ComponentProps, type ComponentType, type Ref } from "react";
import { ActivityIndicator, View } from "react-native";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { KnowledgeMap, KnowledgeMapHandle } from "./knowledge-map";
import { AppText } from "./ui/primitives";
import { colors, space } from "@/theme/tokens";

/**
 * Navegador (expo start --web, só para testes): o Skia precisa carregar o CanvasKit
 * (WebAssembly) antes de qualquer componente dele ser importado.
 * public/canvaskit.wasm é copiado por "npm run web:setup".
 */

type Props = ComponentProps<typeof KnowledgeMap>;
type MapComponent = ComponentType<Props & { ref?: Ref<KnowledgeMapHandle> }>;

export const MapCanvas = forwardRef<KnowledgeMapHandle, Props>(function MapCanvas(props, ref) {
  const [Map, setMap] = useState<MapComponent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Publicado em /app (EXPO_PUBLIC_WEB_BASE), o canvaskit.wasm fica em /app/canvaskit.wasm.
    LoadSkiaWeb({ locateFile: (file) => `${process.env.EXPO_PUBLIC_WEB_BASE ?? ""}/${file}` })
      .then(() => import("./knowledge-map"))
      .then((module) => setMap(() => module.KnowledgeMap as unknown as MapComponent))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar o Skia no navegador."));
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl }}>
        <AppText color={colors.danger}>{error}</AppText>
      </View>
    );
  }
  if (!Map) return <ActivityIndicator color={colors.violet400} style={{ flex: 1 }} />;
  return <Map ref={ref} {...props} />;
});
