import { useEffect } from "react";
import { Easing, type Animated } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { router } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { AppTabBar } from "@/components/tab-bar";
import { DashboardProvider } from "@/components/left-dashboard";
import type { IconName } from "@/components/ui/icon";
import { useLayout } from "@/theme/layout";

/**
 * Três abas, nesta ordem: Feed, Kally e Ambiente; o ambiente abre na Kally. Buscar e as pastas ficam no painel da
 * esquerda (left-dashboard.tsx), e o mapa de conexões virou uma tela própria, aberta por ele.
 */
const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: "feed", title: "Feed", icon: "home" },
  { name: "perguntar", title: "Kally", icon: "kally" },
  { name: "conta", title: "Ambiente", icon: "settings" },
];
/** O ambiente abre na Kally (também quando o grupo de abas é aberto sem uma aba escolhida). */
export const unstable_settings = { initialRouteName: "perguntar" };

const icons = Object.fromEntries(tabs.map((tab) => [tab.name, tab.icon])) as Record<string, IconName>;

/**
 * Troca de aba em transição cruzada (~260 ms): a tela que sai se apaga enquanto a nova acende,
 * no mesmo ritmo (a soma das opacidades fica em 1, então o preto do fundo nunca pisca entre
 * as duas). As duas deslizam um pouco na direção da aba escolhida (a da direita chega pela
 * direita) e a que sai recua levemente: dá o sentido do caminho sem parecer uma página virando.
 *
 * Parada (progresso ±1), a aba escondida volta ao lugar e ao tamanho: deslocada 18 px, ela fazia o contêiner das abas
 * transbordar, e na web o navegador rolava a tela inteira para o lado (a Kally aparecia cortada à esquerda).
 */
const sceneStyleInterpolator = ({ current }: { current: { progress: Animated.AnimatedInterpolation<number> } }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({ inputRange: [-1, -0.85, -0.15, 0, 0.15, 0.85, 1], outputRange: [0, 0, 1, 1, 1, 0, 0] }),
    transform: [
      { translateX: current.progress.interpolate({ inputRange: [-1, -0.999, 0, 0.999, 1], outputRange: [0, -18, 0, 18, 0] }) },
      { scale: current.progress.interpolate({ inputRange: [-1, -0.999, 0, 0.999, 1], outputRange: [1, 0.985, 1, 0.985, 1] }) },
    ],
  },
});

const crossfade = { animation: "timing" as const, config: { duration: 260, easing: Easing.bezier(0.2, 0, 0, 1) } };

/**
 * As abas montam na primeira visita; se a nova ainda não está pronta quando a antiga se apaga,
 * a troca passa por um quadro preto. Depois que a primeira tela (a Kally) assenta, as outras são
 * pré-carregadas em segundo plano, uma de cada vez, sem pesar na abertura do ambiente.
 */
const PREFETCH = ["/feed", "/conta"] as const;

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
    <DashboardProvider docked={variant === "side"}>
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
    </DashboardProvider>
  );
}
