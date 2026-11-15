import { createContext, useContext, useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { AppText, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { feedback } from "@/lib/feedback";
import { latexToText } from "@/lib/math-text";
import { enter } from "@/theme/motion";
import { colors, panels, radius, space } from "@/theme/tokens";

/**
 * Perguntas interativas da Kally: o bloco ```quiz vira cartões com botões. A pessoa toca numa opção, vê se acertou e a
 * explicação; no fim, o placar e (no chat) um botão que manda o resultado para a Kally comentar.
 *
 *   ```quiz
 *   ? Enunciado
 *   - opção errada
 *   * opção certa
 *   > Explicação.
 *   ```
 *
 * Fora do chat (num post), o botão de mandar o resultado não aparece.
 */

export type QuizQuestion = { prompt: string; options: { text: string; right: boolean }[]; why: string };

/** Lê o bloco. Pergunta sem opção certa (ou com mais de uma) fica de fora: melhor não mostrar do que mostrar errado. */
export function parseQuiz(source: string): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  let current: QuizQuestion | null = null;
  // Fórmulas em LaTeX (\(x^{2}\), \frac{5}{3}) viram texto com símbolos, como no resto da resposta: o modelo às vezes
  // escreve LaTeX mesmo sendo pedido que não.
  for (const raw of latexToText(source).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const q = line.match(/^\?\s*(.+)$/) ?? line.match(/^(?:\d+[.)]|#+)\s*(.+\?)$/);
    if (q) {
      current = { prompt: q[1].trim(), options: [], why: "" };
      questions.push(current);
      continue;
    }
    if (!current) continue;
    const option = line.match(/^([-*+]|\[[ xX]\])\s+(.+)$/);
    if (option) {
      const right = option[1] === "*" || /^\[[xX]\]$/.test(option[1]);
      current.options.push({ text: option[2].trim(), right });
      continue;
    }
    const why = line.match(/^>\s*(.+)$/);
    if (why) current.why = current.why ? `${current.why} ${why[1].trim()}` : why[1].trim();
  }
  return questions.filter((x) => x.options.length >= 2 && x.options.filter((o) => o.right).length === 1);
}

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/** Texto com `código` entre crases (o resto do Markdown não cabe num botão). */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <AppText key={i} style={styles.code}>{part.slice(1, -1)}</AppText>
        ) : (
          part.replace(/\*\*([^*]+)\*\*/g, "$1")
        ),
      )}
    </>
  );
}

/** No chat: manda um texto como se a pessoa tivesse escrito (perguntar.tsx). */
export const QuizContext = createContext<((text: string) => void) | null>(null);

export function QuizBlock({ source }: { source: string }) {
  const questions = useMemo(() => parseQuiz(source), [source]);
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const [sent, setSent] = useState(false);
  const send = useContext(QuizContext);
  if (!questions.length) return null;

  const answered = picked.filter((p) => p !== null).length;
  const right = picked.filter((p, i) => p !== null && questions[i].options[p].right).length;
  const done = answered === questions.length;

  const choose = (qi: number, oi: number) => {
    if (picked[qi] !== null) return;
    if (questions[qi].options[oi].right) feedback.success();
    else feedback.tap();
    setPicked((list) => list.map((p, i) => (i === qi ? oi : p)));
  };

  const report = () => {
    if (!send || sent) return;
    const wrong = questions
      .map((q, i) => ({ q, p: picked[i] }))
      .filter(({ q, p }) => p !== null && !q.options[p].right)
      .map(({ q, p }) => `"${q.prompt}" (marquei "${q.options[p as number].text}", a certa era "${q.options.find((o) => o.right)?.text}")`);
    setSent(true);
    send(
      wrong.length
        ? `Fiz o quiz e acertei ${right} de ${questions.length}. Errei: ${wrong.join("; ")}. Me explica o que eu errei?`
        : `Fiz o quiz e acertei todas as ${questions.length}. Quero um desafio um pouco mais difícil.`,
    );
  };

  return (
    <View style={styles.quiz} accessibilityLabel={`Quiz com ${questions.length} perguntas`}>
      {questions.map((q, qi) => {
        const choice = picked[qi];
        return (
          <View key={qi} style={styles.question}>
            <AppText variant="label" color={colors.violet300}>{`Pergunta ${qi + 1} de ${questions.length}`}</AppText>
            <AppText variant="body" style={styles.prompt}><Inline text={q.prompt} /></AppText>
            <View style={styles.options}>
              {q.options.map((o, oi) => {
                const chosen = choice === oi;
                const reveal = choice !== null;
                const state = reveal && o.right ? "right" : chosen ? "wrong" : reveal ? "dim" : "idle";
                return (
                  <Touchable
                    key={oi}
                    onPress={() => choose(qi, oi)}
                    disabled={reveal}
                    pressScale={0.98}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chosen, disabled: reveal }}
                    accessibilityLabel={`${o.text}${reveal ? (o.right ? ", resposta certa" : chosen ? ", sua resposta, errada" : "") : ""}`}
                    style={[styles.option, state === "right" && styles.optionRight, state === "wrong" && styles.optionWrong, state === "dim" && styles.optionDim]}
                  >
                    <View style={[styles.mark, state === "right" && { borderColor: colors.success }, state === "wrong" && { borderColor: colors.danger }]}>
                      {state === "right" ? <Icon name="check" size={12} color={colors.success} /> : state === "wrong" ? <Icon name="close" size={12} color={colors.danger} /> : null}
                    </View>
                    <AppText variant="body" style={{ flex: 1 }} color={state === "dim" ? colors.faint : colors.text}><Inline text={o.text} /></AppText>
                  </Touchable>
                );
              })}
            </View>
            {choice !== null ? (
              <Animated.View entering={enter.fade} style={styles.why}>
                <AppText variant="small" color={q.options[choice].right ? colors.success : colors.danger}>{q.options[choice].right ? "Isso!" : "Não foi dessa vez."}</AppText>
                {q.why ? <AppText variant="small" color={colors.muted}><Inline text={q.why} /></AppText> : null}
              </Animated.View>
            ) : null}
          </View>
        );
      })}
      {done ? (
        <Animated.View entering={enter.fade} style={styles.score}>
          <AppText variant="body" color={colors.violet200}>{`Você acertou ${right} de ${questions.length}.`}</AppText>
          {send ? (
            <Touchable onPress={report} disabled={sent} pressScale={0.97} accessibilityRole="button" accessibilityLabel="Mandar o resultado para a Kally" style={[styles.reportButton, sent && styles.optionDim]}>
              <AppText variant="small" color={colors.text}>{sent ? "Resultado enviado" : right === questions.length ? "Pedir um desafio maior" : "Revisar os erros com a Kally"}</AppText>
            </Touchable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  quiz: { gap: space.md, marginBottom: space.lg },
  question: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: panels.stage, borderWidth: StyleSheet.hairlineWidth, borderColor: panels.border },
  prompt: { fontWeight: "600" },
  code: { fontFamily: mono, fontSize: 14, color: colors.violet200, backgroundColor: colors.violet950 },
  options: { gap: space.xs },
  option: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: panels.tile },
  optionRight: { borderColor: colors.success },
  optionWrong: { borderColor: colors.danger },
  optionDim: { opacity: 0.6 },
  mark: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  why: { gap: 2, paddingHorizontal: space.xs },
  score: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: panels.border },
  reportButton: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.violet600 },
});
