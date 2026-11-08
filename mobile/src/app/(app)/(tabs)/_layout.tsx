import { Tabs } from "expo-router/js-tabs";
import { Easing } from "react-native";
import { AppTabBar } from "@/components/tab-bar";
import type { IconName } from "@/components/ui/icon";
import { colors } from "@/theme/tokens";
import { useLayout } from "@/theme/layout";

const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: "feed", title: "Início", icon: "home" },
  { name: "buscar", title: "Buscar", icon: "search" },
  { name: "mapa", title: "Mapa", icon: "map" },
  { name: "perguntar", title: "Kally", icon: "chat" },
  { name: "conta", title: "Ambiente", icon: "settings" },
];
const icons = Object.fromEntries(tabs.map((tab) => [tab.name, tab.icon])) as Record<string, IconName>;

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
        // Troca de aba: esmaecimento curto com desaceleração (as telas já estão montadas).
        animation: "fade",
        transitionSpec: { animation: "timing", config: { duration: 200, easing: Easing.bezier(0.2, 0, 0, 1) } },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title, tabBarAccessibilityLabel: tab.title }} />
      ))}
    </Tabs>
  );
}
