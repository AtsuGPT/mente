import { useEffect, useRef } from "react";
import { Platform } from "react-native";

/**
 * Teclado nos modais da web: Esc fecha, o foco entra no diálogo ao abrir e volta ao
 * elemento de origem ao fechar. O Modal do react-native-web deveria fazer isso, mas
 * nesta versão ele nunca marca o modal como ativo (nem Esc nem a captura de foco funcionam).
 * No celular não faz nada (lá o botão "voltar" já chama onRequestClose).
 */
export function useDialogKeyboard(visible: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (Platform.OS !== "web" || !visible || typeof document === "undefined") return;
    const origin = document.activeElement as HTMLElement | null;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
      }
    };
    // Captura: o TextInput do react-native-web interrompe a propagação das teclas.
    document.addEventListener("keydown", onKey, true);

    // Depois de montado: foca o primeiro campo (ou o primeiro elemento focável) do diálogo mais recente.
    const timer = setTimeout(() => {
      const dialogs = document.querySelectorAll<HTMLElement>("[aria-modal]");
      const dialog = dialogs[dialogs.length - 1];
      // O primeiro campo; sem campo, o primeiro elemento focável (o fundo fica fora: tabindex -1).
      const target =
        dialog?.querySelector<HTMLElement>("input, textarea") ??
        Array.from(dialog?.querySelectorAll<HTMLElement>('[tabindex], button, a[href]') ?? []).find((el) => el.getAttribute("tabindex") !== "-1");
      target?.focus();
    }, 60);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey, true);
      if (origin && document.contains(origin)) origin.focus();
    };
  }, [visible]);
}
