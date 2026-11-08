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
        // Troca de aba: a nova tela desliza um pouco e acende, com mola firme (sem rebote),
        // e a anterior recua no sentido oposto. As telas continuam montadas (estado preservado).
        animation: "shift",
        transitionSpec: { animation: "spring", config: { stiffness: 700, damping: 72, mass: 1, overshootClamping: true } },
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
