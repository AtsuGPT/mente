import type { Animated } from "react-native";
import { Tabs } from "expo-router/js-tabs";
import { AppTabBar } from "@/components/tab-bar";
import type { IconName } from "@/components/ui/icon";
import { useLayout } from "@/theme/layout";

const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: "feed", title: "Início", icon: "home" },
  { name: "buscar", title: "Buscar", icon: "search" },
  { name: "mapa", title: "Mapa", icon: "map" },
  { name: "perguntar", title: "Kally", icon: "chat" },
  { name: "conta", title: "Ambiente", icon: "settings" },
];
const icons = Object.fromEntries(tabs.map((tab) => [tab.name, tab.icon])) as Record<string, IconName>;

/**
 * A tela que sai continua inteira no primeiro terço do percurso, as duas se cruzam no terço
 * do meio (a soma das opacidades é sempre 1: o fundo nunca aparece sozinho, nada pisca) e a
 * nova assenta no último terço, deslizando só 14 px.
 */
const sceneStyleInterpolator = ({ current }: { current: { progress: Animated.AnimatedInterpolation<number> } }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({ inputRange: [-1, -0.65, -0.35, 0, 0.35, 0.65, 1], outputRange: [0, 0, 1, 1, 1, 0, 0] }),
    transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-14, 0, 14] }) }],
  },
});

export default function TabsLayout() {
  // Celular: abas embaixo. Tablet deitado e telas maiores: barra lateral (com rótulos ao lado
  // dos ícones a partir de 1024 px), para o conteúdo não esticar nem ficar longe da navegação.
  const { sidebar, size } = useLayout();
  const variant = !sidebar ? "bottom" : size === "expanded" ? "side" : "rail";

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} variant={variant} icons={icons} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: sidebar ? "left" : "bottom",
        // Troca de aba: mola criticamente amortecida (ζ ≈ 1, sem rebote nem cauda lenta) e
        // troca cruzada curta. As telas continuam montadas (estado preservado).
        animation: "shift",
        sceneStyleInterpolator,
        transitionSpec: { animation: "spring", config: { stiffness: 520, damping: 46, mass: 1, overshootClamping: true, restDisplacementThreshold: 0.002, restSpeedThreshold: 0.002 } },
        // Cenas transparentes: a moldura (gradiente e aurora) fica por baixo de todas as abas.
        sceneStyle: { backgroundColor: "transparent" },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title, tabBarAccessibilityLabel: tab.title }} />
      ))}
    </Tabs>
  );
}
