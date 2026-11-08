import { useRef, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useEnvironment } from "@/lib/environment";
import { ApiError } from "@/lib/api";
import { API_SOURCE, API_URL } from "@/lib/config";
import { NeuralBrain } from "@/components/neural-brain";
import { AppText, Button, TextField, Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, elevation, fonts, radius, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";
import { KeyboardScreen } from "@/components/keyboard-screen";
import { RadialGlow } from "@/components/ui/surface";

export default function LoginScreen() {
  const { signIn, state } = useAuth();
  const { pending: intent } = useEnvironment();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const container = useContainer("form");
  const passwordRef = useRef<TextInputInstance>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(state.status === "ready" ? state.notice ?? "" : "");

  async function run() {
    if (pending) return;
    if (!username.trim() || !password) {
      setError("Informe usuário e senha.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await signIn(username.trim(), password);
      // A central de ambientes retoma o que estava pendente (ambiente ou convite).
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "Não foi possível entrar.");
      setPending(false);
    }
  }

  // Em telas baixas (celular deitado) a ilustração encolhe para o formulário caber.
  const illustration = Math.max(120, Math.min(width - space.xxl * 2, 340, Math.round(height * 0.34)));

  return (
    <KeyboardScreen style={{ overflow: "hidden" }}>
      <RadialGlow size={460} color={colors.violet600} opacity={0.55} style={styles.glow} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }, container]}
      >
        <Animated.View entering={FadeIn.duration(900)} style={{ alignItems: "center" }}>
          <NeuralBrain width={illustration} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.brand}>
          <AppText variant="label" color={colors.violet300}>{intent ? `Entre para abrir ${intent.name}` : "Sua conta"}</AppText>
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
              onSubmitEditing={() => void run()}
              maxLength={1024}
              style={{ paddingRight: 52 }}
            />
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"}
              onPress={() => setShowPassword((value) => !value)}
              hitSlop={6}
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

          <Button label="Entrar" icon="send" loading={pending} onPress={() => void run()} />

          <View style={styles.divider}>
            <View style={styles.rule} />
            <AppText variant="label" color={colors.faint}>ou</AppText>
            <View style={styles.rule} />
          </View>

          <Button
            label="Criar conta"
            variant="secondary"
            disabled={pending}
            onPress={() => router.push("/cadastro")}
          />
          <Button label="Voltar aos ambientes" variant="ghost" disabled={pending} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        </Animated.View>

        <AppText variant="small" color={colors.faint} style={styles.server}>
          Servidor ({API_SOURCE}): {API_URL.replace(/^https?:\/\//, "")}
        </AppText>
      </ScrollView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    top: -120,
    alignSelf: "center",
  },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: space.xl },
  brand: { alignItems: "center", gap: space.sm, marginTop: space.lg },
  title: { textAlign: "center", marginTop: space.xs },
  form: { marginTop: space.xxl, gap: space.lg, padding: space.xl, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.glass, ...elevation.float },
  eye: { position: "absolute", right: 4, bottom: 3, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
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
