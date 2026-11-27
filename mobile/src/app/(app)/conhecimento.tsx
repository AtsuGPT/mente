import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useCurrentEnvironment } from "@/lib/environment";
import type { KnowledgeGraph, KnowledgeLink } from "@/lib/knowledge";
import { StateView } from "@/components/ui/primitives";
import { colors } from "@/theme/tokens";
import KnowledgeMap from "@/components/knowledge/knowledge-map";

/**
 * Mapa de Conhecimento: o grafo vem do servidor (só o que a pessoa pode ver, sem IA) e o mapa roda como componente DOM
 * (webview no celular, direto na web). Abrir um material volta para as telas nativas do app.
 */
export default function KnowledgeScreen() {
  const { api, environment } = useCurrentEnvironment();
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.knowledge().then(setGraph, (cause) => setError(cause instanceof Error ? cause.message : "Não consegui carregar o mapa."));
  }, [api]);
  useEffect(load, [load]);

  const open = useCallback(async (link: KnowledgeLink) => {
    if (link.kind === "pasta") router.push({ pathname: "/categoria/[slug]", params: { slug: link.slug } });
    else if (link.kind === "pensamento") router.push({ pathname: "/post/[slug]", params: { slug: link.slug } });
    else if (link.kind === "conversa") router.push({ pathname: "/perguntar", params: { conversa: link.id } });
    else router.push({ pathname: "/artefato/[id]", params: { id: link.id } });
  }, []);

  if (!graph) return <StateView loading={!error} error={error} onRetry={load} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KnowledgeMap graph={graph} environmentName={environment.name} onOpen={open} dom={{ style: { flex: 1 }, containerStyle: { flex: 1 }, scrollEnabled: false, bounces: false, overScrollMode: "never" }} />
    </View>
  );
}
