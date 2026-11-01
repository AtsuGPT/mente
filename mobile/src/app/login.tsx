import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { API_SOURCE, API_URL } from "@/lib/config";
import { NeuralBrain } from "@/components/neural-brain";
import { AppText, Button, TextField, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, fonts, radius, space } from "@/theme/tokens";

export default function LoginScreen() {
  const { signIn, enterAsGuest, state } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const passwordRef = useRef<TextInputInstance>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<"login" | "guest" | null>(null);
  const [error, setError] = useState(state.status === "signedOut" ? state.notice ?? "" : "");

  async function run(kind: "login" | "guest") {
    if (pending) return;
    if (kind === "login" && (!username.trim() || !password)) {
      setError("Informe usuário e senha.");
      return;
    }
    setPending(kind);
    setError("");
    try {
      if (kind === "login") await signIn(username.trim(), password);
      else await enterAsGuest();
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "Não foi possível entrar.");
      setPending(null);
    }
  }

  const illustration = Math.min(width - space.xxl * 2, 340);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View pointerEvents="none" style={styles.glow} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]}
      >
        <Animated.View entering={FadeIn.duration(900)} style={{ alignItems: "center" }}>
          <NeuralBrain width={illustration} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.brand}>
          <AppText variant="label" color={colors.violet300}>Arquivo pessoal · kayk</AppText>
          <AppText variant="display" style={styles.title}>
            Minha <AppText variant="display" style={{ fontFamily: fonts.serifItalic, color: colors.violet200 }}>Mente</AppText>
          </AppText>
          <AppText color={colors.muted} style={{ textAlign: "center" }}>Pensamentos guardados, ideias em movimento.</AppText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.form}>
          <TextField
            label="Usuário"
            value={username}
            onChangeText={setUsername}
            placeholder="Seu usuário"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            maxLength={254}
          />
          <View>
            <TextField
              ref={passwordRef}
              label="Senha"
              value={password}
              onChangeText={setPassword}
              placeholder="Sua senha"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void run("login")}
              maxLength={1024}
              style={{ paddingRight: 52 }}
            />
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"}
              onPress={() => setShowPassword((value) => !value)}
              hitSlop={10}
              style={styles.eye}
            >
              <Icon name="eye" size={20} color={showPassword ? colors.violet300 : colors.faint} />
            </Touchable>
          </View>

          {error ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.error} accessibilityRole="alert">
              <AppText variant="small" color={colors.danger}>{error}</AppText>
            </Animated.View>
          ) : null}

          <Button label="Entrar" icon="send" loading={pending === "login"} disabled={!!pending && pending !== "login"} onPress={() => void run("login")} />

          <View style={styles.divider}>
            <View style={styles.rule} />
            <AppText variant="label" color={colors.faint}>ou</AppText>
            <View style={styles.rule} />
          </View>

          <Button
            label="Entrar como convidado"
            variant="secondary"
            loading={pending === "guest"}
            disabled={!!pending && pending !== "guest"}
            onPress={() => void run("guest")}
          />
        </Animated.View>

        <AppText variant="small" color={colors.faint} style={styles.server}>
          Servidor ({API_SOURCE}): {API_URL.replace(/^https?:\/\//, "")}
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    top: -120,
    alignSelf: "center",
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: colors.violet950,
    opacity: 0.9,
  },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: space.xl },
  brand: { alignItems: "center", gap: space.sm, marginTop: space.lg },
  title: { textAlign: "center", marginTop: space.xs },
  form: { marginTop: space.xxl, gap: space.lg },
  eye: { position: "absolute", right: 14, bottom: 15 },
  error: {
    borderWidth: 1,
    borderColor: "#5A2228",
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  divider: { flexDirection: "row", alignItems: "center", gap: space.md },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong },
  server: { textAlign: "center", marginTop: space.xxl },
});
