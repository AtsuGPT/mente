import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { DarkTheme, Stack, ThemeProvider, type Theme } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
// Cada peso importado direto: importar da raiz do pacote embutiria todos os pesos.
import { Newsreader_400Regular } from "@expo-google-fonts/newsreader/400Regular";
import { Newsreader_400Regular_Italic } from "@expo-google-fonts/newsreader/400Regular_Italic";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader/500Medium";
import { InstrumentSans_400Regular } from "@expo-google-fonts/instrument-sans/400Regular";
import { InstrumentSans_500Medium } from "@expo-google-fonts/instrument-sans/500Medium";
import { InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans/600SemiBold";
import { AuthProvider, useAuth } from "@/lib/auth";
import { EnvironmentProvider, useEnvironment } from "@/lib/environment";
import { AppText, Button } from "@/components/ui/primitives";
import { NeuralBrain } from "@/components/neural-brain";
import { colors, fonts, space } from "@/theme/tokens";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.violet400,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.line,
    notification: colors.violet500,
  },
};

/**
 * Na web (minhamente.space/app) o app fica numa coluna com largura de celular no centro da
 * janela; esticado na tela inteira as proporções do layout ficavam erradas. No celular não muda nada.
 */
const WEB_MAX_WIDTH = 480;
function WebFrame({ children }: { children: React.ReactNode }) {
  // O fundo da própria página também fica escuro (ao rolar além do fim e atrás dos modais).
  useEffect(() => {
    if (Platform.OS === "web") document.body.style.backgroundColor = colors.bg;
  }, []);
  if (Platform.OS !== "web") return <>{children}</>;
  return (
    <View style={styles.webOuter}>
      <View style={styles.webColumn}>{children}</View>
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error]);

  // Se as fontes falharem, o app segue com as do sistema em vez de travar.
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={theme}>
        <AuthProvider>
          <EnvironmentProvider>
            <StatusBar style="light" />
            <WebFrame>
              <RootStack />
            </WebFrame>
          </EnvironmentProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** Opções comuns das pilhas de navegação (raiz e dentro do ambiente). */
export const stackOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.violet300,
  headerTitleStyle: { fontFamily: fonts.sansSemibold, color: colors.text, fontSize: 16 },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: "minimal" as const,
  contentStyle: { backgroundColor: colors.bg },
  animation: "slide_from_right" as const,
};

function RootStack() {
  const { state, retry } = useAuth();
  const { current } = useEnvironment();

  if (state.status === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <NeuralBrain width={200} />
      </View>
    );
  }

  if (state.status === "offline") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: space.xxl }}>
        <NeuralBrain width={180} />
        <AppText variant="title" style={{ marginTop: space.xl, textAlign: "center" }}>Sem conexão</AppText>
        <AppText color={colors.muted} style={{ marginTop: space.sm, textAlign: "center" }}>{state.message}</AppText>
        <Button label="Tentar de novo" onPress={() => void retry()} style={{ marginTop: space.xl, alignSelf: "stretch" }} />
      </View>
    );
  }

  // Primeiro a central de ambientes; o grupo (app) só existe com um ambiente aberto.
  // Ao sair do ambiente, o grupo inteiro é desmontado: nada de um ambiente vaza para outro.
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="login" options={{ headerShown: false, animation: "fade_from_bottom" }} />
      <Stack.Screen name="cadastro" options={{ title: "Criar conta" }} />
      <Stack.Screen name="ambiente-novo" options={{ title: "Novo ambiente", presentation: "modal" }} />
      <Stack.Protected guard={!!current}>
        <Stack.Screen name="(app)" options={{ headerShown: false, animation: "fade" }} />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  webOuter: { flex: 1, alignItems: "center", backgroundColor: colors.bg },
  webColumn: { flex: 1, width: "100%", maxWidth: WEB_MAX_WIDTH, overflow: "hidden", borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
});
