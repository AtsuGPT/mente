import { StyleSheet } from "react-native";
import { Tabs } from "expo-router/js-tabs";
import { Icon, type IconName } from "@/components/ui/icon";
import { colors, fonts } from "@/theme/tokens";

const tabs: { name: string; title: string; icon: IconName }[] = [
  { name: "feed", title: "Início", icon: "home" },
  { name: "buscar", title: "Buscar", icon: "search" },
  { name: "mapa", title: "Mapa", icon: "map" },
  { name: "perguntar", title: "Perguntar", icon: "chat" },
  { name: "conta", title: "Ambiente", icon: "settings" },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.violet300,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => <Icon name={tab.icon} size={22} color={String(color)} strokeWidth={focused ? 1.9 : 1.6} />,
          }}
        />
      ))}
    </Tabs>
  );
}
