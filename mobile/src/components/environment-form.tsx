import { useState } from "react";
import { ScrollView, StyleSheet, Switch, View } from "react-native";
import { HEX_COLOR } from "@shared/color";
import type { EnvironmentInput } from "@/lib/api";
import type { FieldErrors } from "@/lib/types";
import { EnvironmentGlyph, ENVIRONMENT_ICONS, withAlpha } from "./environment-glyph";
import { AppText, Button, SectionLabel, TextField, Touchable } from "./ui/primitives";
import { Icon } from "./ui/icon";
import { colors, radius, space } from "@/theme/tokens";

/** Paleta sugerida (qualquer #RRGGBB vale); o roxo é o padrão do Minha Mente. */
const SWATCHES = ["#7C5CE0", "#9D5CF0", "#4F7CFF", "#2BB3A3", "#E0A23B", "#E05C8A", "#5CA8E0", "#8AA05C"];

/** Formulário de ambiente (criar e configurar), com prévia de como ele aparece na central. */
export function EnvironmentForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<EnvironmentInput>;
  submitLabel: string;
  onSubmit: (input: EnvironmentInput) => Promise<FieldErrors | void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? "#7C5CE0");
  const [icon, setIcon] = useState(initial?.icon ?? "brain");
  const [guestAccess, setGuestAccess] = useState(initial?.guestAccess ?? false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErrors({});
    try {
      const fieldErrors = await onSubmit({ name: name.trim(), description: description.trim(), color, icon, guestAccess });
      if (fieldErrors) setErrors(fieldErrors);
    } finally {
      setBusy(false);
    }
  }

  const valid = HEX_COLOR.test(color);

  return (
    <View style={{ gap: space.lg }}>
      <View style={[styles.preview, { borderColor: withAlpha(valid ? color : colors.violet600, 0.35) }]}>
        <EnvironmentGlyph color={valid ? color : colors.violet600} icon={icon} size={56} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={1}>{name || "Nome do ambiente"}</AppText>
          <AppText variant="small" color={colors.muted} numberOfLines={2}>{description || "Uma descrição curta, opcional."}</AppText>
        </View>
      </View>

      <TextField label="Nome" value={name} onChangeText={setName} error={errors.name?.[0]} maxLength={60} />
      <TextField label="Descrição" value={description} onChangeText={setDescription} error={errors.description?.[0]} multiline maxLength={280} />

      <View style={{ gap: space.sm }}>
        <SectionLabel>Ícone</SectionLabel>
        <View style={styles.grid}>
          {ENVIRONMENT_ICONS.map((name) => (
            <Touchable key={name} accessibilityLabel={`Ícone ${name}`} accessibilityState={{ selected: icon === name }} onPress={() => setIcon(name)} style={[styles.option, icon === name && styles.optionOn]}>
              <Icon name={name} size={22} color={icon === name ? colors.violet200 : colors.muted} />
            </Touchable>
          ))}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <SectionLabel>Cor</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {SWATCHES.map((swatch) => (
            <Touchable key={swatch} accessibilityLabel={`Cor ${swatch}`} onPress={() => setColor(swatch)} style={[styles.swatch, { backgroundColor: swatch }, color.toLowerCase() === swatch.toLowerCase() && styles.swatchOn]} />
          ))}
        </ScrollView>
        <TextField value={color} onChangeText={setColor} error={errors.color?.[0] ?? (!valid ? "Use o formato #RRGGBB." : undefined)} autoCapitalize="characters" maxLength={7} />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="uiMedium">Aberto a visitantes</AppText>
          <AppText variant="small" color={colors.muted}>Quem não participa pode ler os pensamentos públicos. Os privados continuam só para participantes.</AppText>
        </View>
        <Switch value={guestAccess} onValueChange={setGuestAccess} trackColor={{ true: colors.violet600, false: colors.lineStrong }} thumbColor={colors.text} />
      </View>

      <Button label={submitLabel} icon="check" loading={busy} disabled={!name.trim() || !valid} onPress={() => void submit()} />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, borderWidth: 1, backgroundColor: colors.glass },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: { width: 52, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass, alignItems: "center", justifyContent: "center" },
  optionOn: { borderColor: colors.violet500, backgroundColor: colors.violet950 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "transparent" },
  swatchOn: { borderColor: colors.text },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass },
});
