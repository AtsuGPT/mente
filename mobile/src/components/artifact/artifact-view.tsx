import { useEffect, useId, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { Markdown } from "@/components/markdown/markdown";
import { useDialogKeyboard } from "@/lib/use-dialog-keyboard";
import { KIND_INFO, type ArtifactKind, type SurfaceMessage } from "@/lib/artifact";
import { colors, radius, space } from "@/theme/tokens";
import { ArtifactSurface } from "./artifact-surface";

/**
 * O artefato funcionando: a caixa de areia (ou o Markdown, para documentos) com carregamento, altura automática e os
 * erros que o código der ao rodar (que a pessoa pode mandar para a Kally corrigir).
 */
export function ArtifactPreview({
  source,
  format,
  maxHeight = 520,
  minHeight = 160,
  fill = false,
  onErrors,
}: {
  source: string;
  format: string;
  maxHeight?: number;
  minHeight?: number;
  /** Ocupa todo o espaço (tela cheia): a página rola por dentro. */
  fill?: boolean;
  onErrors?: (errors: string[]) => void;
}) {
  const id = `a${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // No celular, a prévia nunca passa de ~60% da altura da tela (o resto rola por dentro ou vai para a tela cheia).
  const screen = useWindowDimensions();
  const limit = Math.max(minHeight, Math.min(maxHeight, Math.round(screen.height * 0.6)));
  const [height, setHeight] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // Código novo (outra versão): começa de novo.
  useEffect(() => {
    setReady(false);
    setErrors([]);
    setNotice(null);
    const timer = setTimeout(() => setReady(true), 8_000);
    return () => clearTimeout(timer);
  }, [source]);
  useEffect(() => {
    onErrors?.(errors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors]);

  if (format === "markdown") {
    return (
      <View style={[styles.doc, !fill && { maxHeight }]}>
        <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: space.lg }}>
          <Markdown>{source}</Markdown>
        </ScrollView>
      </View>
    );
  }

  const onMessage = (m: SurfaceMessage) => {
    if (m.type === "altura") setHeight(m.height);
    else if (m.type === "pronto") setReady(true);
    else if (m.type === "erro") setErrors((list) => (list.includes(m.message) ? list : [...list, m.message].slice(-3)));
    else if (m.type === "aviso") setNotice(m.message);
  };
  const shown = fill ? "fill" : Math.max(minHeight, Math.min(height ?? 260, limit));
  return (
    <View style={fill ? styles.fill : undefined}>
      <View style={fill ? styles.fill : { height: shown as number }}>
        <ArtifactSurface source={source} id={id} height={shown} scroll={fill || (height ?? 0) > limit} onMessage={onMessage} fit={fill ? "tela" : "largura"} />
        {!ready ? (
          <View style={[StyleSheet.absoluteFill, styles.loading]} pointerEvents="none">
            <ActivityIndicator color={colors.violet300} />
          </View>
        ) : null}
      </View>
      {notice ? (
        <AppText variant="small" color={colors.violet200} style={styles.notice}>
          {notice}
        </AppText>
      ) : null}
      {errors.length ? (
        <View style={styles.errors}>
          <Icon name="close" size={14} color={colors.danger} />
          <AppText variant="small" color={colors.danger} style={{ flex: 1 }} numberOfLines={3}>
            O código deu erro ao rodar: {errors[errors.length - 1]}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/** Tela cheia: o artefato ocupa tudo, com o título e o fechar no alto. */
export function ArtifactFullscreen({ visible, onClose, title, kind, source, format }: { visible: boolean; onClose: () => void; title: string; kind: ArtifactKind; source: string; format: string }) {
  const insets = useSafeAreaInsets();
  useDialogKeyboard(visible, onClose);
  const info = KIND_INFO[kind];
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.full, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.fullHead}>
          <Icon name={info.icon} size={16} color={info.color} />
          <AppText variant="uiMedium" style={{ flex: 1 }} numberOfLines={1}>
            {title}
          </AppText>
          <Touchable accessibilityLabel="Fechar tela cheia" onPress={onClose} hitSlop={8} pressScale={0.9} style={styles.icon}>
            <Icon name="close" size={18} color={colors.text} />
          </Touchable>
        </View>
        {visible ? <ArtifactPreview source={source} format={format} fill /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  doc: { backgroundColor: colors.bg },
  notice: { paddingHorizontal: space.md, paddingTop: space.sm },
  errors: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.dangerSoft, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#4A1C22" },
  full: { flex: 1, backgroundColor: colors.bg },
  fullHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  icon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});

/**
 * Antes de rodar código escrito à mão por outra pessoa. A caixa de areia já impede acesso à conta, ao app e à internet;
 * este passo protege do que sobra: uma interface enganosa (um "formulário" falso) e um código que trava a tela.
 */
export function RunConsent({ author, onRun }: { author: string; onRun: () => void }) {
  return (
    <View style={consentStyles.consent}>
      <Icon name="lock" size={18} color={colors.violet300} />
      <AppText variant="uiMedium" style={{ textAlign: "center" }}>Código escrito à mão por {author}</AppText>
      <AppText variant="small" color={colors.muted} style={{ textAlign: "center", maxWidth: 420 }}>
        Ele roda isolado, sem acesso à sua conta, ao app ou à internet. Mesmo assim, só rode se confiar em quem escreveu, e nunca digite senhas dentro de um artefato.
      </AppText>
      <Touchable accessibilityRole="button" onPress={onRun} haptic style={consentStyles.consentButton}>
        <Icon name="play" size={15} color="#FFFFFF" />
        <AppText variant="uiMedium" color="#FFFFFF">Rodar</AppText>
      </Touchable>
    </View>
  );
}

const consentStyles = StyleSheet.create({
  consent: { alignItems: "center", gap: space.sm, padding: space.xl, minHeight: 200, justifyContent: "center" },
  consentButton: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs, paddingHorizontal: space.lg, minHeight: 40, borderRadius: radius.pill, backgroundColor: colors.violet600 },
});
