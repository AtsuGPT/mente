import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Alert } from "@/lib/alert";
import { contrastRatio, HEX_COLOR, readableAccent } from "@shared/color";
import { slugify } from "@shared/slug";
import { ApiError } from "@/lib/api";
import { useCurrentEnvironment } from "@/lib/environment";
import type { Category, FieldErrors } from "@/lib/types";
import { AppText, Button, SectionLabel, StateView, TextField, Touchable } from "@/components/ui/primitives";
import { colors, radius, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";
import { KeyboardScreen } from "@/components/keyboard-screen";

type Draft = { name: string; slug: string; description: string; color: string; position: string };
const empty: Draft = { name: "", slug: "", description: "", color: "#7C5CE0", position: "0" };

/** Categorias (pastas) do ambiente: criar, editar, ordenar e excluir. */
export default function AdminCategoriesScreen() {
  const container = useContainer("form");
  const { api } = useCurrentEnvironment();
  const [categories, setCategories] = useState<(Category & { count: number })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "nova" | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories((await api.manageCategories()).categories);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function open(category?: Category) {
    setErrors({});
    setMessage("");
    setEditing(category?.id ?? "nova");
    setDraft(category ? { name: category.name, slug: category.slug, description: category.description, color: category.color, position: String(category.position) } : empty);
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setMessage("");
    const form = new FormData();
    for (const [key, value] of Object.entries(draft)) form.append(key, value);
    try {
      if (editing === "nova") await api.createCategory(form);
      else if (editing) await api.updateCategory(editing, form);
      setEditing(null);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors) setErrors(cause.fieldErrors);
      setMessage(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  function remove(category: Category & { count: number }) {
    Alert.alert(`Excluir "${category.name}"?`, `Os ${category.count} pensamentos continuam existindo, apenas sem esta categoria.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteCategory(category.id);
            setEditing(null);
            await load();
          } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : "Não foi possível excluir.");
          }
        },
      },
    ]);
  }

  const validColor = HEX_COLOR.test(draft.color);
  const err = (field: string) => errors[field]?.[0];

  if (!categories) return <StateView loading={!error} error={error} onRetry={() => void load()} />;

  return (
    <KeyboardScreen header>
    <ScrollView contentContainerStyle={[{ padding: space.lg, gap: space.md, paddingBottom: space.xxxl }, container]} keyboardShouldPersistTaps="handled">
      {categories.map((category) => (
        <View key={category.id}>
          <Touchable onPress={() => (editing === category.id ? setEditing(null) : open(category))} style={[styles.row, editing === category.id && styles.rowOpen]}>
            <View style={[styles.swatch, { backgroundColor: category.color }]} />
            <View style={{ flex: 1 }}>
              <AppText variant="uiMedium">{category.name}</AppText>
              <AppText variant="small" color={colors.faint}>/{category.slug} · posição {category.position}</AppText>
            </View>
            <AppText variant="label" color={colors.faint}>{category.count}</AppText>
          </Touchable>
          {editing === category.id ? renderForm() : null}
        </View>
      ))}

      {editing === "nova" ? renderForm() : <Button label="Nova categoria" icon="plus" variant="secondary" onPress={() => open()} />}
    </ScrollView>
    </KeyboardScreen>
  );

  // Função (não componente): um componente declarado aqui seria recriado a cada
  // tecla e os campos perderiam o foco.
  function renderForm() {
    return (
      <View style={styles.form}>
        <SectionLabel>{editing === "nova" ? "Nova categoria" : "Editar categoria"}</SectionLabel>
        <TextField label="Nome" value={draft.name} error={err("name")} maxLength={60} onChangeText={(name) => setDraft((d) => ({ ...d, name, slug: editing === "nova" ? slugify(name, 60) : d.slug }))} />
        <TextField label="Endereço" value={draft.slug} error={err("slug")} autoCapitalize="none" maxLength={120} onChangeText={(slug) => setDraft((d) => ({ ...d, slug }))} />
        <TextField label="Descrição" value={draft.description} error={err("description")} multiline maxLength={280} onChangeText={(description) => setDraft((d) => ({ ...d, description }))} />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <TextField
            label="Cor"
            value={draft.color}
            error={err("color")}
            autoCapitalize="none"
            maxLength={7}
            containerStyle={{ flex: 1 }}
            onChangeText={(color) => setDraft((d) => ({ ...d, color }))}
          />
          <TextField label="Posição" value={draft.position} error={err("position")} keyboardType="number-pad" maxLength={3} containerStyle={{ width: 96 }} onChangeText={(position) => setDraft((d) => ({ ...d, position }))} />
        </View>
        {validColor ? (
          <View style={styles.preview}>
            <View style={[styles.swatch, { backgroundColor: draft.color }]} />
            <AppText variant="label" color={readableAccent(draft.color)}>{draft.name || "Prévia"}</AppText>
            <AppText variant="small" color={colors.faint}>contraste {contrastRatio(draft.color, colors.bg).toFixed(1)}:1 · texto ajustado {contrastRatio(readableAccent(draft.color), colors.bg).toFixed(1)}:1</AppText>
          </View>
        ) : null}
        {message ? <AppText variant="small" color={colors.danger}>{message}</AppText> : null}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Salvar" loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
          <Button label="Cancelar" variant="ghost" onPress={() => setEditing(null)} />
        </View>
        {editing && editing !== "nova" ? (
          <Button label="Excluir categoria" variant="danger" icon="trash" onPress={() => { const c = categories?.find((x) => x.id === editing); if (c) remove(c); }} />
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass },
  rowOpen: { borderColor: colors.violet700 },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  form: { marginTop: space.sm, padding: space.lg, gap: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.violet800, backgroundColor: colors.violet950 },
  preview: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
});
