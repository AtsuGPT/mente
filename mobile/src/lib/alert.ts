import { Alert as NativeAlert, Platform, type AlertButton } from "react-native";

/**
 * Alert.alert que funciona também na web. No react-native-web, `Alert.alert` é uma função vazia:
 * confirmações (sair da conta, excluir, remover) e avisos de erro simplesmente não apareciam no
 * site, e a ação parecia não responder ao clique.
 *
 * Mesma assinatura do React Native. No celular, delega ao alerta nativo; na web, abre o diálogo do
 * app (components/ui/alert-host.tsx), acessível por teclado e leitor de tela. Se o diálogo ainda
 * não estiver montado, cai nos diálogos do próprio navegador.
 */
export type AlertRequest = { title: string; message?: string; buttons: AlertButton[] };

let host: ((request: AlertRequest) => void) | null = null;

export function registerAlertHost(show: (request: AlertRequest) => void) {
  host = show;
  return () => {
    if (host === show) host = null;
  };
}

function browserFallback({ title, message, buttons }: AlertRequest) {
  const text = message ? `${title}\n\n${message}` : title;
  const cancel = buttons.find((button) => button.style === "cancel");
  const actions = buttons.filter((button) => button.style !== "cancel");
  if (!actions.length || (actions.length === 1 && !cancel)) {
    window.alert(text);
    (actions[0] ?? cancel)?.onPress?.();
    return;
  }
  if (window.confirm(text)) actions[0].onPress?.();
  else cancel?.onPress?.();
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== "web") return NativeAlert.alert(title, message, buttons);
    const request = { title, message, buttons: buttons?.length ? buttons : [{ text: "OK" }] };
    if (host) host(request);
    else browserFallback(request);
  },
};
