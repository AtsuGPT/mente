import { useEffect, type ComponentProps, type ReactNode } from "react";
import { Platform } from "react-native";
import { DarkTheme, Stack, ThemeProvider, type Theme } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
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
import { ScreenBackdrop, ScreenFrame } from "@/components/ui/surface";
import { AlertHost } from "@/components/ui/alert-host";
import { colors, fonts, space } from "@/theme/tokens";
import { duration, enter } from "@/theme/motion";

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
 * Na web o app ocupa a janela inteira; cada tela limita a própria largura de leitura
 * (theme/layout.ts) e, em telas largas, as abas viram barra lateral. No celular não muda nada.
 */
function WebFrame({ children }: { children: React.ReactNode }) {
  // O fundo da própria página também fica escuro (ao rolar além do fim e atrás dos modais).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    document.body.style.backgroundColor = colors.bg;
    // Foco visível ao navegar pelo teclado (o react-native-web remove o contorno padrão dos campos).
    const style = document.createElement("style");
    style.id = "mm-focus";
    style.textContent = "input:focus-visible,textarea:focus-visible{outline:2px solid " + colors.violet400 + ";outline-offset:2px}";
    if (!document.getElementById(style.id)) document.head.appendChild(style);
  }, []);
  return <>{children}</>;
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
              <AlertHost />
            </WebFrame>
          </EnvironmentProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** Opções comuns das pilhas de navegação (raiz e dentro do ambiente). */
export const stackOptions = {
  // O cabeçalho tem a cor do topo do fundo das telas: os dois parecem uma superfície só.
  headerStyle: { backgroundColor: colors.bgTop },
  headerTintColor: colors.violet300,
  headerTitleStyle: { fontFamily: fonts.sansSemibold, color: colors.text, fontSize: 16 },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: "minimal" as const,
  contentStyle: { backgroundColor: colors.bg },
  headerTitleAlign: "center" as const,
  animation: "slide_from_right" as const,
  // Android: duração da transição de pilha dentro da faixa de navegação (iOS usa a nativa).
  animationDuration: duration.navigation,
};

/**
 * Toda tela das pilhas é desenhada sobre a moldura do novo visual (gradiente, aurora e
 * vinheta), opaca, para que nenhuma tela fique com o fundo antigo e as transições nativas
 * não mostrem a tela de baixo. Na web, a página ainda entra com um esmaecimento curto.
 */
export const screenLayout = ({ children, navigation, route }: { children: ReactNode; navigation: ComponentProps<typeof ScreenFrame>["navigation"]; route: { name: string } }) =>
  route.name === "(app)" ? <>{children}</> : <ScreenFrame navigation={navigation}>{children}</ScreenFrame>;

function RootStack() {
  const { state, retry } = useAuth();
  const { current } = useEnvironment();

  if (state.status === "loading") {
    return (
      <Animated.View entering={enter.fade} style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ScreenBackdrop />
        <NeuralBrain width={200} />
      </Animated.View>
    );
  }

  if (state.status === "offline") {
    return (
      <Animated.View entering={enter.fade} style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: space.xxl }}>
        <ScreenBackdrop />
        <NeuralBrain width={180} />
        <AppText variant="title" style={{ marginTop: space.xl, textAlign: "center" }}>Sem conexão</AppText>
        <AppText color={colors.muted} style={{ marginTop: space.sm, textAlign: "center" }}>{state.message}</AppText>
        <Button label="Tentar de novo" onPress={() => void retry()} style={{ marginTop: space.xl, alignSelf: "center", width: "100%", maxWidth: 360 }} />
      </Animated.View>
    );
  }

  // Primeiro a central de ambientes; o grupo (app) só existe com um ambiente aberto.
  // Ao sair do ambiente, o grupo inteiro é desmontado: nada de um ambiente vaza para outro.
  return (
    <Stack screenOptions={stackOptions} screenLayout={screenLayout}>
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

