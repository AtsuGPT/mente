import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { ApiError } from "@/lib/api";
import { useCurrentEnvironment } from "@/lib/environment";
import { pickImage, uploadablePart } from "@/lib/upload";
import { EnvironmentForm } from "@/components/environment-form";
import { EnvironmentGlyph } from "@/components/environment-glyph";
import { goToEnvironments } from "@/components/environment-header";
import { AppText, Button, Card, SectionLabel } from "@/components/ui/primitives";
import { colors, space } from "@/theme/tokens";

/** Configurações do ambiente (só o proprietário; o servidor confere). */
export default function EnvironmentSettingsScreen() {
  const { api, environment, session, refresh } = useCurrentEnvironment();
  const [busy, setBusy] = useState<"upload" | "remove" | "archive" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const isOriginal = environment.id === "mente";

  async function upload() {
    setMessage(null);
    try {
      const asset = await pickImage();
      if (!asset) return;
      setBusy("upload");
      const { part, name } = await uploadablePart(asset);
      const form = new FormData();
      form.append("image", part, name);
      await api.setImage(form);
      await refresh();
      setMessage({ ok: true, text: "Foto atualizada." });
    } catch (cause) {
      setMessage({ ok: false, text: cause instanceof Error ? cause.message : "Não foi possível enviar a foto." });
    } finally {
      setBusy(null);
    }
  }

  async function removeImage() {
    setBusy("remove");
    setMessage(null);
    try {
      await api.removeImage();
      await refresh();
      setMessage({ ok: true, text: "Foto removida." });
    } catch (cause) {
      setMessage({ ok: false, text: cause instanceof Error ? cause.message : "Não foi possível remover." });
    } finally {
      setBusy(null);
    }
  }

  function archive() {
    Alert.alert(`Arquivar ${environment.name}?`, "Ele some da lista dos participantes. Nada é apagado e você pode reativá-lo depois.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Arquivar",
        style: "destructive",
        onPress: async () => {
          setBusy("archive");
          try {
            await api.setArchived(true);
            goToEnvironments();
          } catch (cause) {
            setMessage({ ok: false, text: cause instanceof Error ? cause.message : "Não foi possível arquivar." });
            setBusy(null);
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
        <EnvironmentForm
          initial={environment}
          submitLabel="Salvar configurações"
          onSubmit={async (input) => {
            try {
              await api.updateSettings(input);
              await refresh();
              setMessage({ ok: true, text: "Configurações salvas." });
            } catch (cause) {
              if (cause instanceof ApiError && cause.fieldErrors) return cause.fieldErrors;
              setMessage({ ok: false, text: cause instanceof Error ? cause.message : "Não foi possível salvar." });
            }
          }}
        />

        <View style={{ gap: space.md }}>
          <SectionLabel>Foto</SectionLabel>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <EnvironmentGlyph color={environment.color} icon={environment.icon} image={session.image} size={64} />
            <AppText variant="small" color={colors.muted} style={{ flex: 1 }}>
              {isOriginal ? "No Minha Mente, é a mesma foto de perfil do site." : "Opcional: aparece no lugar do ícone."} JPG, PNG ou WebP, até 700 KB.
            </AppText>
          </Card>
          <Button label="Escolher foto" icon="image" variant="secondary" loading={busy === "upload"} disabled={!!busy} onPress={() => void upload()} />
          {session.image ? <Button label="Remover foto" variant="ghost" loading={busy === "remove"} disabled={!!busy} onPress={() => void removeImage()} /> : null}
        </View>

        {message ? <AppText variant="small" color={message.ok ? colors.success : colors.danger}>{message.text}</AppText> : null}

        {!isOriginal ? (
          <View style={{ gap: space.md }}>
            <SectionLabel>Arquivar</SectionLabel>
            <AppText variant="small" color={colors.muted}>Arquivar esconde o ambiente de todos, menos de você. Nenhum pensamento é apagado.</AppText>
            <Button label="Arquivar ambiente" variant="danger" loading={busy === "archive"} disabled={!!busy} onPress={archive} />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
