import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { router } from "expo-router";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { EnvironmentForm } from "@/components/environment-form";
import { AppText, Button, StateView } from "@/components/ui/primitives";
import { colors, space } from "@/theme/tokens";
import { KeyboardScreen } from "@/components/keyboard-screen";

/** Criar um ambiente: quem cria vira o proprietário. */
export default function NewEnvironmentScreen() {
  const { user } = useAuth();

  if (!user) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
        <StateView empty="Entre com sua conta para criar um ambiente." />
        <Button label="Entrar" onPress={() => router.replace("/login")} />
      </ScrollView>
    );
  }

  return (
    <KeyboardScreen header>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <AppText color={colors.muted}>Um ambiente é um espaço seu: pensamentos, pastas e mapa próprios, com quem você convidar.</AppText>
        <EnvironmentForm
          submitLabel="Criar ambiente"
          onSubmit={async (input) => {
            try {
              await api.createEnvironment(input);
              router.back();
            } catch (cause) {
              if (cause instanceof ApiError && cause.fieldErrors) return cause.fieldErrors;
              return { name: [cause instanceof Error ? cause.message : "Não foi possível criar o ambiente."] };
            }
          }}
        />
      </ScrollView>
    </KeyboardScreen>
  );
}
