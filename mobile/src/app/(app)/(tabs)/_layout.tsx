import { useEffect } from "react";
import { Easing, type Animated } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { router } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { AppTabBar } from "@/components/tab-bar";
import type { IconName } from "@/components/ui/icon";
import { useLayout } from "@/theme/layout";

const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: "feed", title: "Pensamentos", icon: "home" },
  { name: "buscar", title: "Buscar", icon: "search" },
  { name: "mapa", title: "Mapa", icon: "map" },
  { name: "perguntar", title: "Kally", icon: "kally" },
  { name: "conta", title: "Ambiente", icon: "settings" },
];
const icons = Object.fromEntries(tabs.map((tab) => [tab.name, tab.icon])) as Record<string, IconName>;

/**
 * Troca de aba em transição cruzada (~220 ms): a tela que sai se apaga enquanto a nova acende,
 * no mesmo ritmo (a soma das opacidades fica em 1, então o preto do fundo nunca pisca entre
 * as duas). Sem deslocamento: só a luz muda.
 */
const sceneStyleInterpolator = ({ current }: { current: { progress: Animated.AnimatedInterpolation<number> } }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({ inputRange: [-1, -0.85, -0.15, 0, 0.15, 0.85, 1], outputRange: [0, 0, 1, 1, 1, 0, 0] }),
  },
});

const crossfade = { animation: "timing" as const, config: { duration: 220, easing: Easing.bezier(0.2, 0, 0, 1) } };

/**
 * As abas montam na primeira visita; se a nova ainda não está pronta quando a antiga se apaga,
 * a troca passa por um quadro preto. Depois que a primeira tela assenta, as outras são
 * pré-carregadas em segundo plano (uma de cada vez, das mais leves para o mapa), sem pesar na
 * abertura do ambiente.
 */
const PREFETCH = ["/buscar", "/conta", "/perguntar", "/mapa"] as const;

export default function TabsLayout() {
  // Celular: abas embaixo. Tablet deitado e telas maiores: barra lateral (com rótulos ao lado
  // dos ícones a partir de 1024 px), para o conteúdo não esticar nem ficar longe da navegação.
  const { sidebar, size } = useLayout();
  const variant = !sidebar ? "bottom" : size === "expanded" ? "side" : "rail";
  // "Reduzir movimento": a troca de aba é imediata.
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timers = PREFETCH.map((href, i) =>
      setTimeout(() => {
        try {
          router.prefetch(href);
        } catch {
          // Sem pré-carga, a aba só monta na primeira visita (como antes).
        }
      }, 900 + i * 500),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} variant={variant} icons={icons} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: sidebar ? "left" : "bottom",
        // As telas continuam montadas ao trocar (estado e rolagem preservados).
        animation: reduceMotion ? "none" : "fade",
        sceneStyleInterpolator,
        transitionSpec: crossfade,
        // Cenas transparentes sobre o preto da moldura.
        sceneStyle: { backgroundColor: "transparent" },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title, tabBarAccessibilityLabel: tab.title }} />
      ))}
    </Tabs>
  );
}
