import { useEffect } from "react";
import { View } from "react-native";
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
          <StatusBar style="light" />
          <RootStack />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const { state, isAdmin, retry } = useAuth();

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

  const signedIn = state.status === "signedIn";
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.violet300,
        headerTitleStyle: { fontFamily: fonts.sansSemibold, color: colors.text, fontSize: 16 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="post/[slug]" options={{ title: "" }} />
        <Stack.Screen name="categoria/[slug]" options={{ title: "" }} />
        <Stack.Screen name="pastas" options={{ title: "Pastas" }} />
        <Stack.Screen name="sobre" options={{ title: "Sobre" }} />
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="painel/index" options={{ title: "Painel" }} />
          <Stack.Screen name="painel/categorias" options={{ title: "Categorias" }} />
          <Stack.Screen name="painel/configuracoes" options={{ title: "Configurações" }} />
          <Stack.Screen name="editor/[id]" options={{ title: "", gestureEnabled: false }} />
        </Stack.Protected>
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false, animation: "fade" }} />
      </Stack.Protected>
    </Stack>
  );
}
