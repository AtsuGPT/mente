import { Stack } from "expo-router";
import { useCurrentEnvironment } from "@/lib/environment";
import { screenLayout, stackOptions } from "../_layout";

/**
 * Telas de dentro de um ambiente. As de gestão só existem para quem tem a permissão
 * correspondente; o servidor confere de novo a cada requisição.
 */
export default function EnvironmentStack() {
  const { permissions } = useCurrentEnvironment();
  const canWrite = permissions.publish || permissions.manageContent;

  return (
    <Stack screenOptions={stackOptions} screenLayout={screenLayout}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="post/[slug]" options={{ title: "" }} />
      <Stack.Screen name="categoria/[slug]" options={{ title: "" }} />
      <Stack.Screen name="pastas" options={{ title: "Pastas" }} />
      <Stack.Screen name="base" options={{ title: "Base de documentos" }} />
      <Stack.Screen name="sobre" options={{ title: "Sobre" }} />
      <Stack.Screen name="painel/participantes" options={{ title: "Participantes" }} />
      <Stack.Protected guard={canWrite}>
        <Stack.Screen name="painel/index" options={{ title: "Pensamentos" }} />
        <Stack.Screen name="editor/[id]" options={{ title: "", gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={permissions.manageContent}>
        <Stack.Screen name="painel/categorias" options={{ title: "Categorias" }} />
      </Stack.Protected>
      <Stack.Protected guard={permissions.manageSettings}>
        <Stack.Screen name="painel/configuracoes" options={{ title: "Configurações do ambiente" }} />
      </Stack.Protected>
    </Stack>
  );
}
