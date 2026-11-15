import { useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { ConvergenceSymbol, type ConvergencePart } from "@/components/convergence-symbol";
import { AppText, Chip, Touchable } from "@/components/ui/primitives";
import { enter, exit } from "@/theme/motion";
import { colors, panels, radius, space } from "@/theme/tokens";

/**
 * Bloco ```convergencia dos posts: o símbolo da Mente desenhado ao vivo (nítido em qualquer tela), para explicar as
 * partes dele.
 *
 *   ```convergencia parte=kayk lado=direita     → o símbolo pequeno, com a parte em destaque, ao lado do texto do bloco
 *   texto em Markdown…
 *   ```
 *   ```convergencia interativo                  → o símbolo maior e as partes para tocar (Tudo, Kayk, Julia, Emenda, Conexão)
 *   ```
 *
 * parte: tudo | kayk | julia | emenda | conexao. lado: direita | esquerda (padrão: esquerda).
 */

const PARTS: { id: ConvergencePart; label: string; caption: string }[] = [
  { id: "tudo", label: "Tudo", caption: "As duas órbitas e a luz onde elas se cruzam." },
  { id: "kayk", label: "Kayk", caption: "Oito pontos, como as contas do colar. O oitavo é a emenda." },
  { id: "julia", label: "Julia", caption: "Fios finos que correm juntos; o ruivo aparece só nas pontas." },
  { id: "emenda", label: "Emenda", caption: "O oitavo ponto: onde o colar quebrou e foi remendado." },
  { id: "conexao", label: "Conexão", caption: "O nono significado. Ninguém desenhou essa luz: ela nasce do encontro." },
];

export function parseConvergence(info: string) {
  const options = Object.fromEntries(
    info
      .split(/\s+/)
      .slice(1)
      .map((w) => w.split("="))
      .map(([k, v]) => [k.toLowerCase(), (v ?? "true").toLowerCase()]),
  ) as Record<string, string>;
  const part = (PARTS.some((p) => p.id === options.parte) ? options.parte : "tudo") as ConvergencePart;
  return { interactive: options.interativo === "true", part, side: options.lado === "direita" ? ("direita" as const) : ("esquerda" as const) };
}

/** O símbolo pequeno ao lado do texto. */
export function ConvergenceAside({ part, side, children }: { part: ConvergencePart; side: "direita" | "esquerda"; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const size = width < 380 ? 96 : width < 700 ? 116 : 148;
  return (
    <View style={[styles.aside, side === "direita" && styles.asideRight]}>
      <View style={[styles.symbolBox, { width: size, height: size }]}>
        <ConvergenceSymbol size={size} focus={part} />
      </View>
      <View style={styles.asideText}>{children}</View>
    </View>
  );
}

/** O símbolo maior, com as partes para tocar; tocar no símbolo passa para a próxima parte. */
export function ConvergenceExplorer() {
  const { width } = useWindowDimensions();
  const [part, setPart] = useState<ConvergencePart>("tudo");
  const size = Math.min(320, Math.round(width * 0.72));
  const current = PARTS.find((p) => p.id === part) ?? PARTS[0];
  const next = () => setPart(PARTS[(PARTS.findIndex((p) => p.id === part) + 1) % PARTS.length].id);
  return (
    <View style={styles.explorer}>
      <Touchable onPress={next} pressScale={0.97} accessibilityRole="button" accessibilityLabel={`Símbolo Convergência, parte em destaque: ${current.label}. Toque para ver a próxima parte.`}>
        <ConvergenceSymbol size={size} focus={part} breathe />
      </Touchable>
      <View style={styles.chips} accessibilityRole="tablist">
        {PARTS.map((p) => (
          <Chip key={p.id} label={p.label} selected={p.id === part} onPress={() => setPart(p.id)} />
        ))}
      </View>
      <View style={styles.captionSlot}>
        <Animated.View key={part} entering={enter.fade} exiting={exit.fade} style={styles.caption}>
          <AppText variant="small" color={colors.muted} style={{ textAlign: "center" }}>{current.caption}</AppText>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  aside: { flexDirection: "row", alignItems: "center", gap: space.lg, marginBottom: space.lg },
  asideRight: { flexDirection: "row-reverse" },
  symbolBox: { borderRadius: radius.lg, backgroundColor: panels.tile, borderWidth: StyleSheet.hairlineWidth, borderColor: panels.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  asideText: { flex: 1, minWidth: 0 },
  explorer: { alignItems: "center", gap: space.md, marginVertical: space.lg, paddingVertical: space.lg, borderRadius: radius.xl, backgroundColor: panels.stage, borderWidth: StyleSheet.hairlineWidth, borderColor: panels.border },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.sm, paddingHorizontal: space.md },
  captionSlot: { minHeight: 40, alignSelf: "stretch", paddingHorizontal: space.lg },
  caption: { position: "absolute", left: space.lg, right: space.lg, top: 0 },
});
