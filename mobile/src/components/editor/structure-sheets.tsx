import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Sheet } from "@/components/ui/sheet";
import { AppText, Button, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { Diagram } from "@/components/markdown/diagram";
import { DIAGRAM_TEMPLATE, diagramToMarkdown, tableToMarkdown, type TableData } from "@/lib/structured";
import { colors, radius, space, tint, type } from "@/theme/tokens";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const EMPTY: TableData = { header: ["Coluna 1", "Coluna 2", "Coluna 3"], rows: [["", "", ""], ["", "", ""]] };

/**
 * Editor de tabela: uma grade de células editáveis (cabeçalho em destaque) com botões para
 * acrescentar e tirar linhas e colunas. Salva como tabela GFM no Markdown do pensamento, o
 * mesmo formato que o site e a Kally usam.
 */
export function TableEditorSheet({ visible, initial, onClose, onSave }: { visible: boolean; initial: TableData | null; onClose: () => void; onSave: (markdown: string) => void }) {
  const [table, setTable] = useState<TableData>(EMPTY);
  useEffect(() => {
    if (visible) setTable(initial ? { header: [...initial.header], rows: initial.rows.map((row) => [...row]) } : { header: [...EMPTY.header], rows: EMPTY.rows.map((row) => [...row]) });
  }, [visible, initial]);
  const columns = table.header.length;

  const setCell = (row: number, column: number, value: string) =>
    setTable((current) =>
      row < 0
        ? { ...current, header: current.header.map((cell, i) => (i === column ? value : cell)) }
        : { ...current, rows: current.rows.map((cells, r) => (r === row ? cells.map((cell, i) => (i === column ? value : cell)) : cells)) },
    );
  const addRow = () => setTable((t) => ({ ...t, rows: [...t.rows, Array(t.header.length).fill("")] }));
  const removeRow = () => setTable((t) => (t.rows.length > 1 ? { ...t, rows: t.rows.slice(0, -1) } : t));
  const addColumn = () => setTable((t) => (t.header.length >= 8 ? t : { header: [...t.header, `Coluna ${t.header.length + 1}`], rows: t.rows.map((row) => [...row, ""]) }));
  const removeColumn = () => setTable((t) => (t.header.length > 1 ? { header: t.header.slice(0, -1), rows: t.rows.map((row) => row.slice(0, -1)) } : t));

  const cell = (row: number, column: number, value: string) => (
    <TextInput
      key={`${row}-${column}`}
      value={value}
      onChangeText={(text) => setCell(row, column, text)}
      placeholder={row < 0 ? `Coluna ${column + 1}` : "—"}
      placeholderTextColor={colors.faint}
      selectionColor={colors.violet400}
      accessibilityLabel={row < 0 ? `Cabeçalho da coluna ${column + 1}` : `Linha ${row + 1}, coluna ${column + 1}`}
      style={[styles.cell, row < 0 && styles.headerCell]}
    />
  );

  return (
    <Sheet visible={visible} onClose={onClose} keyboard>
      <View style={styles.titleRow}>
        <Icon name="table" size={18} color={colors.violet300} />
        <AppText variant="heading" style={{ flex: 1 }}>{initial ? "Editar tabela" : "Nova tabela"}</AppText>
        <AppText variant="small" color={colors.faint}>{table.rows.length} × {columns}</AppText>
      </View>
      <ScrollView horizontal keyboardShouldPersistTaps="handled" style={styles.gridScroll} contentContainerStyle={{ paddingBottom: space.xs }}>
        <View style={styles.grid}>
          <View style={styles.row}>{table.header.map((value, c) => cell(-1, c, value))}</View>
          {table.rows.map((row, r) => (
            <View key={r} style={styles.row}>{row.map((value, c) => cell(r, c, value))}</View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.controls}>
        <Control icon="plus" label="Linha" onPress={addRow} />
        <Control icon="minus" label="Linha" onPress={removeRow} disabled={table.rows.length <= 1} />
        <Control icon="plus" label="Coluna" onPress={addColumn} disabled={columns >= 8} />
        <Control icon="minus" label="Coluna" onPress={removeColumn} disabled={columns <= 1} />
      </View>
      <Button label={initial ? "Atualizar tabela" : "Inserir tabela"} icon="table" onPress={() => onSave(tableToMarkdown(table))} style={{ marginTop: space.md }} />
    </Sheet>
  );
}

function Control({ icon, label, onPress, disabled }: { icon: "plus" | "minus"; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Touchable accessibilityLabel={`${icon === "plus" ? "Acrescentar" : "Remover"} ${label.toLowerCase()}`} onPress={onPress} disabled={disabled} pressScale={0.95} style={[styles.control, disabled && { opacity: 0.4 }]}>
      <Icon name={icon} size={14} color={colors.violet300} />
      <AppText variant="small" color={colors.text}>{label}</AppText>
    </Touchable>
  );
}

/**
 * Editor de diagrama: a definição Mermaid em texto, com prévia desenhada logo abaixo (atualiza
 * quando a digitação para). Salva como bloco ```mermaid.
 */
export function DiagramEditorSheet({ visible, initial, onClose, onSave }: { visible: boolean; initial: string | null; onClose: () => void; onSave: (markdown: string) => void }) {
  const [source, setSource] = useState(DIAGRAM_TEMPLATE);
  const [preview, setPreview] = useState(DIAGRAM_TEMPLATE);
  useEffect(() => {
    if (!visible) return;
    const start = initial ?? DIAGRAM_TEMPLATE;
    setSource(start);
    setPreview(start);
  }, [visible, initial]);
  useEffect(() => {
    const timer = setTimeout(() => setPreview(source), 700);
    return () => clearTimeout(timer);
  }, [source]);

  return (
    <Sheet visible={visible} onClose={onClose} keyboard>
      <View style={styles.titleRow}>
        <Icon name="flow" size={18} color={colors.violet300} />
        <AppText variant="heading" style={{ flex: 1 }}>{initial ? "Editar diagrama" : "Novo diagrama"}</AppText>
      </View>
      <AppText variant="small" color={colors.faint} style={{ marginBottom: space.sm }}>Definição em Mermaid (fluxograma, sequência, linha do tempo…). A prévia se atualiza ao parar de digitar.</AppText>
      <TextInput
        value={source}
        onChangeText={setSource}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        selectionColor={colors.violet400}
        accessibilityLabel="Definição do diagrama"
        style={styles.source}
        textAlignVertical="top"
      />
      <ScrollView style={{ maxHeight: 320, marginTop: space.md }} keyboardShouldPersistTaps="handled">
        {preview.trim() ? <Diagram key={preview} source={preview} /> : null}
      </ScrollView>
      <Button label={initial ? "Atualizar diagrama" : "Inserir diagrama"} icon="flow" disabled={!source.trim()} onPress={() => onSave(diagramToMarkdown(source))} style={{ marginTop: space.sm }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md },
  gridScroll: { maxHeight: 300, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  grid: { backgroundColor: colors.surface },
  row: { flexDirection: "row" },
  cell: { ...type.small, width: 132, minHeight: 42, paddingHorizontal: space.sm, paddingVertical: space.sm, color: colors.text, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  headerCell: { backgroundColor: colors.surfaceRaised, color: colors.violet200, fontFamily: "InstrumentSans_600SemiBold" },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  control: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: tint.selectedBorder, backgroundColor: tint.selected },
  source: { fontFamily: mono, fontSize: 13, lineHeight: 19, color: colors.violet200, minHeight: 140, maxHeight: 220, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: "#07060A" },
});
