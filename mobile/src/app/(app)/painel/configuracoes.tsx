import { useState } from "react";
import { ScrollView, View } from "react-native";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pickImage, uploadablePart } from "@/lib/upload";
import { Avatar } from "@/components/post-card";
import { AppText, Button, Card } from "@/components/ui/primitives";
import { colors, space } from "@/theme/tokens";

/** Mesma tela de /admin/configuracoes: foto de perfil (JPG, PNG ou WebP, até 700 KB). */
export default function SettingsScreen() {
  const { session, refreshSession } = useAuth();
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload() {
    setMessage(null);
    try {
      const asset = await pickImage();
      if (!asset) return;
      setBusy("upload");
      const { part, name } = await uploadablePart(asset);
      const form = new FormData();
      form.append("profileImage", part, name);
      await api.admin.setProfileImage(form);
      await refreshSession(); // recarrega a sessão com a foto nova
      setMessage({ ok: true, text: "Foto de perfil atualizada." });
    } catch (cause) {
      setMessage({ ok: false, text: cause instanceof Error ? cause.message : "Não foi possível enviar a foto." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setMessage(null);
    try {
      await api.admin.removeProfileImage();
      await refreshSession();
      setMessage({ ok: true, text: "Foto removida." });
    } catch (cause) {
      setMessage({ ok: false, text: cause instanceof Error ? cause.message : "Não foi possível remover." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <Card style={{ alignItems: "center", gap: space.md }}>
        <Avatar src={session?.profileImage} size={96} />
        <AppText variant="small" color={colors.muted} style={{ textAlign: "center" }}>
          Aparece ao lado dos pensamentos no site e no app. JPG, PNG ou WebP, até 700 KB.
        </AppText>
      </Card>
      {message ? <AppText variant="small" color={message.ok ? colors.success : colors.danger}>{message.text}</AppText> : null}
      <View style={{ gap: space.sm }}>
        <Button label="Escolher foto" icon="image" loading={busy === "upload"} disabled={!!busy} onPress={() => void upload()} />
        {session?.profileImage ? <Button label="Remover foto" variant="danger" loading={busy === "remove"} disabled={!!busy} onPress={() => void remove()} /> : null}
      </View>
    </ScrollView>
  );
}
