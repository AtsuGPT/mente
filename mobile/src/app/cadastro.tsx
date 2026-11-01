import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEnvironment } from "@/lib/environment";
import type { FieldErrors } from "@/lib/types";
import { AppText, Button, TextField } from "@/components/ui/primitives";
import { colors, space } from "@/theme/tokens";

/** Criar conta. Depois de criada, a pessoa já entra e volta à central de ambientes. */
export default function RegisterScreen() {
  const { register } = useAuth();
  const { pending: intent } = useEnvironment();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password !== confirm) {
      setErrors({ confirm: ["As senhas não são iguais."] });
      return;
    }
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      await register({ displayName: displayName.trim(), username: username.trim().toLowerCase(), password });
      router.dismissTo("/");
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors) setErrors(cause.fieldErrors);
      setMessage(cause instanceof Error ? cause.message : "Não foi possível criar a conta.");
    } finally {
      setBusy(false);
    }
  }

  const err = (field: string) => errors[field]?.[0];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <View>
          <AppText variant="title">Sua conta no Minha Mente</AppText>
          <AppText color={colors.muted} style={{ marginTop: space.xs }}>
            {intent ? `Depois de criar, continuamos para ${intent.name}.` : "Com uma conta você cria ambientes e aceita convites."}
          </AppText>
        </View>
        <TextField label="Como quer ser chamado" value={displayName} onChangeText={setDisplayName} error={err("displayName")} maxLength={60} autoComplete="name" />
        <TextField
          label="Nome de usuário"
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase())}
          error={err("username")}
          hint="3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado."
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          maxLength={32}
        />
        <TextField label="Senha" value={password} onChangeText={setPassword} error={err("password")} hint="Pelo menos 8 caracteres." secureTextEntry autoComplete="new-password" textContentType="newPassword" maxLength={1024} />
        <TextField label="Repita a senha" value={confirm} onChangeText={setConfirm} error={err("confirm")} secureTextEntry autoComplete="new-password" maxLength={1024} onSubmitEditing={() => void submit()} />
        {message && !Object.keys(errors).length ? <AppText variant="small" color={colors.danger}>{message}</AppText> : null}
        <Button label="Criar conta" icon="check" loading={busy} onPress={() => void submit()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
