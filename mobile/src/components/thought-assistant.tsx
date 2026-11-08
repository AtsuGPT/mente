import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { enter, layoutTransition } from "@/theme/motion";
import { streamEvents } from "@/lib/stream";
import { Markdown } from "./markdown/markdown";
import { AppText, Chip } from "./ui/primitives";
import { colors, radius, space } from "@/theme/tokens";

/** Leitura assistida (mesma do site): resumir, esclarecer, aprofundar. */

const actions = [
  { mode: "summarize", label: "Resumir" },
  { mode: "clarify", label: "Esclarecer" },
  { mode: "deepen", label: "Aprofundar" },
] as const;

type Mode = (typeof actions)[number]["mode"];

export function ThoughtAssistant({ slug, revision }: { slug: string; revision: string }) {
  const [selected, setSelected] = useState<Mode | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "reading" | "done">("idle");
  const [error, setError] = useState("");
  // Como no site: cada leitura fica guardada para esta revisão do texto (aqui, enquanto o app está aberto).
  const cache = useRef(new Map<string, string>());

  async function run(mode: Mode) {
    if (status === "connecting" || status === "reading") return;
    setSelected(mode);
    setError("");
    const key = `${revision}:${mode}`;
    const saved = cache.current.get(key);
    if (saved) {
      setText(saved);
      setStatus("done");
      return;
    }
    setText("");
    setStatus("connecting");
    let generated = "";
    try {
      await streamEvents(`/api/thoughts/${encodeURIComponent(slug)}/insight`, { mode }, (event) => {
        if (event.text) {
          generated += event.text;
          setText(generated);
          setStatus("reading");
        }
      });
      if (!generated.trim()) throw new Error("O Ollama não retornou uma leitura desta vez.");
      cache.current.set(key, generated);
      setStatus("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao conectar com o assistente.");
      setStatus("idle");
    }
  }

  return (
    <View style={styles.box}>
      <AppText variant="label" color={colors.violet300}>Leitura assistida · Ollama</AppText>
      <AppText variant="heading" style={{ marginTop: space.xs }}>Explore este pensamento</AppText>
      <View style={styles.actions}>
        {actions.map((action) => (
          <Chip key={action.mode} label={action.label} selected={selected === action.mode} onPress={() => void run(action.mode)} />
        ))}
      </View>
      {status === "connecting" ? <AppText variant="small" color={colors.muted} style={{ marginTop: space.md }}>Conectando ao Ollama…</AppText> : null}
      {error ? <AppText variant="small" color={colors.danger} style={{ marginTop: space.md }}>{error}</AppText> : null}
      {text ? (
        <Animated.View entering={enter.fade} layout={layoutTransition} style={styles.result}>
          <AppText variant="label" color={colors.violet300} style={{ marginBottom: space.sm }}>
            {actions.find((a) => a.mode === selected)?.label} · {status === "reading" ? "gerando" : "pronto"}
          </AppText>
          <Markdown>{text}</Markdown>
          <AppText variant="small" color={colors.faint}>Esta leitura é complementar e não altera o pensamento publicado.</AppText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: space.xxl, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.violet950 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  result: { marginTop: space.lg, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.violet800 },
});
