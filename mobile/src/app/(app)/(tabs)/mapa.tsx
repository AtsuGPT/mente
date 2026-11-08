import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import Animated from "react-native-reanimated";
import { useCurrentEnvironment } from "@/lib/environment";
import { absoluteUrl } from "@/lib/config";
import { formatDateShort, formatNumber } from "@/lib/format";
import { layoutGraph, type LaidOutNode, type Layout } from "@/lib/graph-layout";
import type { KnowledgeMapHandle } from "@/components/knowledge-map";
import { MapCanvas } from "@/components/map-canvas";
import { EnvironmentHeader } from "@/components/environment-header";
import { AppText, Button, Chip, IconButton, StateView } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icon";
import { colors, elevation, radius, space } from "@/theme/tokens";
import { useLayout } from "@/theme/layout";
import { useDialogKeyboard } from "@/lib/use-dialog-keyboard";
import { useAmbientActive } from "@/lib/use-ambient";
import { enter, exit } from "@/theme/motion";

const kindInfo: Record<LaidOutNode["kind"], { label: string; icon: IconName }> = {
  ambiente: { label: "Ambiente", icon: "sparkle" },
  pasta: { label: "Pasta", icon: "folder" },
  pensamento: { label: "Pensamento", icon: "doc" },
  imagem: { label: "Imagem", icon: "image" },
};

const PANEL_HEIGHT = 250;

/** Área de arquivos como mapa de conexões: pastas, pensamentos e imagens reais. */
export default function MapScreen() {
  const { api } = useCurrentEnvironment();
  const insets = useSafeAreaInsets();
  const { sidebar } = useLayout();
  // Mapa fora de foco (outra aba aberta): o movimento ambiente para.
  const ambientActive = useAmbientActive();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const mapRef = useRef<KnowledgeMapHandle>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      setLayout(layoutGraph(await api.map()));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível montar o mapa.");
    }
  }, []);

  // Atualiza ao voltar para a aba (novos pensamentos aparecem no mapa).
  useFocusEffect(
    useCallback(() => {
      if (loadedOnce.current) void load();
      loadedOnce.current = true;
    }, [load]),
  );
  useEffect(() => {
    void load();
  }, [load]);

  const selected = selectedId ? layout?.byId.get(selectedId) ?? null : null;
  const connections = useMemo(() => {
    if (!selected || !layout) return [];
    return [...(layout.neighbors.get(selected.id) ?? [])].map((id) => layout.byId.get(id)).filter((n): n is LaidOutNode => !!n);
  }, [selected, layout]);
  const folders = useMemo(() => layout?.nodes.filter((n) => n.kind === "pasta") ?? [], [layout]);
  const counts = useMemo(() => {
    const c = { ambiente: 0, pasta: 0, pensamento: 0, imagem: 0 };
    layout?.nodes.forEach((n) => c[n.kind]++);
    return c;
  }, [layout]);

  function select(id: string | null, center = false) {
    setSelectedId(id);
    if (id && center) mapRef.current?.focus(id);
    else if (id) mapRef.current?.reveal(id, PANEL_HEIGHT);
  }

  function open(node: LaidOutNode) {
    if (node.kind === "pensamento") router.push({ pathname: "/post/[slug]", params: { slug: node.slug } });
    else if (node.kind === "pasta") router.push({ pathname: "/categoria/[slug]", params: { slug: node.slug } });
    else if (node.kind === "ambiente") router.push("/sobre");
    else setViewing(absoluteUrl(node.src));
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };

  useDialogKeyboard(!!viewing, () => setViewing(null));

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.top, { paddingTop: insets.top + space.md }]}>
        <View style={styles.titleRow}>
          <EnvironmentHeader
            title="Mapa de conexões"
            subtitle={layout ? `${counts.pasta} pastas · ${counts.pensamento} pensamentos · ${counts.imagem} imagens` : undefined}
          />
        </View>
        {folders.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
            {folders.map((folder) => (
              <Chip key={folder.id} label={folder.label} dot={folder.kind === "pasta" ? folder.color : undefined} selected={selectedId === folder.id} onPress={() => select(folder.id, true)} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <View style={{ flex: 1 }} onLayout={onLayout}>
        {!layout || !size ? (
          <StateView loading={!error} error={error} onRetry={() => void load()} />
        ) : layout.nodes.length === 0 ? (
          <StateView empty="Ainda não há pensamentos para mapear." />
        ) : (
          <Animated.View entering={enter.fade} style={StyleSheet.absoluteFill}>
            <MapCanvas
              active={ambientActive}
              ref={mapRef}
              layout={layout}
              width={size.width}
              height={size.height}
              selectedId={selectedId}
              onSelect={(id) => select(id)}
              bottomInset={selected ? PANEL_HEIGHT : 0}
            />
          </Animated.View>
        )}

        {layout && layout.nodes.length ? (
          <View style={styles.controls}>
            <IconButton name="plus" label="Aproximar" onPress={() => mapRef.current?.zoomBy(1.4)} />
            <IconButton name="minus" label="Afastar" onPress={() => mapRef.current?.zoomBy(1 / 1.4)} />
            <IconButton name="target" label="Enquadrar tudo" onPress={() => { select(null); mapRef.current?.fit(); }} />
          </View>
        ) : null}

        {!selected && layout && layout.nodes.length ? (
          <View style={styles.legend} pointerEvents="none">
            <Legend shape="folder" label="Pasta" />
            <Legend shape="post" label="Pensamento" />
            <Legend shape="draft" label="Rascunho" />
            <Legend shape="private" label="Privado" />
            <Legend shape="image" label="Imagem" />
          </View>
        ) : null}

        {selected ? (
          <Animated.View entering={enter.panel} exiting={exit.panel} style={[styles.panel, sidebar && styles.panelWide]}>
            <View style={styles.panelHeader}>
              <Icon name={kindInfo[selected.kind].icon} size={18} color={colors.violet300} />
              <AppText variant="label" color={colors.violet300} style={{ flex: 1 }}>
                {kindInfo[selected.kind].label}
                {selected.kind === "pensamento" ? ` · Nº ${formatNumber(selected.number)}` : ""}
              </AppText>
              <IconButton name="close" label="Fechar detalhes" onPress={() => select(null)} color={colors.muted} />
            </View>
            <AppText variant="title" numberOfLines={2} style={{ fontSize: 21, lineHeight: 27 }}>
              {selected.kind === "imagem" ? "Imagem do arquivo" : selected.label}
            </AppText>
            {selected.kind === "pensamento" ? (
              <AppText variant="small" color={colors.muted} numberOfLines={2} style={{ marginTop: space.xs }}>
                {selected.draft ? "Rascunho · " : ""}{selected.private ? "Privado · " : ""}{formatDateShort(selected.publishedAt)}{selected.excerpt ? ` — ${selected.excerpt}` : ""}
              </AppText>
            ) : selected.kind === "pasta" && selected.description ? (
              <AppText variant="small" color={colors.muted} numberOfLines={2} style={{ marginTop: space.xs }}>{selected.description}</AppText>
            ) : null}

            <AppText variant="label" color={colors.faint} style={{ marginTop: space.md }}>{connections.length} {connections.length === 1 ? "conexão" : "conexões"}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: space.sm }}>
              {connections.map((node) => (
                <Chip key={node.id} label={node.kind === "imagem" ? "Imagem" : node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label} dot={node.kind === "pasta" ? node.color : undefined} onPress={() => select(node.id, true)} />
              ))}
            </ScrollView>

            {selected.kind === "pensamento" && selected.draft ? (
              <AppText variant="small" color={colors.faint}>Rascunhos abrem no editor.</AppText>
            ) : null}
            <Button
              label={selected.kind === "pensamento" ? (selected.draft ? "Abrir no editor" : "Ler pensamento") : selected.kind === "pasta" ? "Abrir pasta" : selected.kind === "ambiente" ? "Sobre o ambiente" : "Ver imagem"}
              compact
              onPress={() =>
                selected.kind === "pensamento" && selected.draft
                  ? router.push({ pathname: "/editor/[id]", params: { id: selected.id.slice(2) } })
                  : open(selected)
              }
              style={{ marginTop: space.sm }}
            />
          </Animated.View>
        ) : null}
      </View>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityLabel="Fechar imagem">
          {viewing ? <Image source={{ uri: viewing }} style={{ width: "100%", height: "80%" }} contentFit="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
  );
}

function Legend({ shape, label }: { shape: "folder" | "post" | "draft" | "private" | "image"; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={[
          styles.legendShape,
          shape === "folder" && { width: 14, height: 14, borderRadius: 7, borderColor: colors.violet300, backgroundColor: "rgba(132,97,240,0.18)" },
          shape === "post" && { borderColor: colors.violet400 },
          shape === "draft" && { borderColor: colors.warning, borderStyle: "dashed" },
          shape === "image" && { borderRadius: 2, borderColor: colors.faint },
          shape === "private" && { borderColor: colors.violet400, alignItems: "center", justifyContent: "center" },
        ]}
      >
        {shape === "private" ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.violet300 }} /> : null}
      </View>
      <AppText variant="small" color={colors.muted} style={{ fontSize: 12, lineHeight: 16 }}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { gap: space.md, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: colors.bg, zIndex: 2 },
  titleRow: { paddingHorizontal: space.lg },
  controls: { position: "absolute", right: space.md, top: space.md, gap: space.xs, padding: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.glass, ...elevation.float },
  legend: { position: "absolute", left: space.md, bottom: space.md, flexDirection: "column", gap: 6, padding: space.sm, paddingHorizontal: space.md, borderRadius: radius.lg, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line },
  legendShape: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, backgroundColor: colors.surfaceRaised },
  panel: {
    position: "absolute",
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    minHeight: PANEL_HEIGHT - space.lg,
    padding: space.lg,
    paddingTop: space.sm,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(14,13,18,0.97)",
    ...elevation.float,
  },
  // Em telas largas o painel vira um cartão no canto, sem cobrir o mapa de ponta a ponta.
  panelWide: { left: space.lg, right: undefined, bottom: space.lg, width: 420 },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: space.sm },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)", alignItems: "center", justifyContent: "center" },
});
