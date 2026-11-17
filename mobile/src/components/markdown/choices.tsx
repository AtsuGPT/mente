import { useContext, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { feedback } from "@/lib/feedback";
import { parseChoices } from "@/lib/blocks";
import { colors, panels, radius, space } from "@/theme/tokens";
import { QuizContext } from "./quiz";

/**
 * Múltipla escolha de orientação (```escolhas): a pessoa diz como quer seguir; não há resposta certa. No chat, tocar
 * numa opção manda o texto dela como a próxima mensagem; fora do chat (num post), as opções aparecem só como lista.
 */
export function ChoicesBlock({ source }: { source: string }) {
  const parsed = useMemo(() => parseChoices(source), [source]);
  const send = useContext(QuizContext);
  const [chosen, setChosen] = useState<number | null>(null);
  if (!parsed) return null;
  const pick = (i: number) => {
    if (!send || chosen !== null) return;
    feedback.tap();
    setChosen(i);
    send(parsed.options[i]);
  };
  return (
    <View style={styles.box} accessibilityLabel={parsed.prompt || "Opções para continuar"}>
      {parsed.prompt ? <AppText variant="body" style={styles.prompt}>{parsed.prompt}</AppText> : null}
      <View style={styles.options}>
        {parsed.options.map((o, i) => {
          const picked = chosen === i;
          const dim = chosen !== null && !picked;
          return (
            <Touchable
              key={i}
              onPress={() => pick(i)}
              disabled={!send || chosen !== null}
              pressScale={0.98}
              accessibilityRole="button"
              accessibilityState={{ selected: picked, disabled: !send || chosen !== null }}
              accessibilityLabel={o}
              style={[styles.option, picked && styles.picked, dim && styles.dim]}
            >
              <AppText variant="body" style={{ flex: 1 }} color={dim ? colors.faint : colors.text}>{o}</AppText>
              {picked ? <Icon name="check" size={14} color={colors.violet300} /> : null}
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, marginBottom: space.lg },
  prompt: { fontWeight: "600" },
  options: { gap: space.xs },
  option: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: panels.tile },
  picked: { borderColor: colors.violet400 },
  dim: { opacity: 0.55 },
});
