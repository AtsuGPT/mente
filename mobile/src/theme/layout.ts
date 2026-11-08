import { useMemo } from "react";
import { useWindowDimensions, type ViewStyle } from "react-native";
import { space } from "./tokens";

/**
 * Layout responsivo (celular, tablet, notebook e monitor). No celular nada muda; a partir
 * de 768 px a navegação vira barra lateral e o conteúdo ganha largura máxima de leitura.
 *
 *  - compact  < 600 px   celular (retrato)
 *  - medium   600–1023   celular deitado, tablet, janela estreita
 *  - expanded ≥ 1024     notebook e monitor
 */
export const breakpoints = { medium: 600, sidebar: 768, expanded: 1024, wide: 1440 } as const;

/** Largura útil do conteúdo (sem as margens laterais). */
export const maxWidths = {
  /** Texto corrido (pensamentos, Sobre): ~70 caracteres por linha. */
  reading: 720,
  /** Listas, chat e painéis. */
  content: 840,
  /** Formulários e telas de entrada. */
  form: 560,
} as const;

export type WidthKind = keyof typeof maxWidths;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const size = width >= breakpoints.expanded ? "expanded" : width >= breakpoints.medium ? "medium" : "compact";
    return {
      width,
      height,
      size,
      /** Navegação das abas na lateral (tablet deitado, notebook, monitor). */
      sidebar: width >= breakpoints.sidebar,
      /** Margem lateral do conteúdo. */
      gutter: size === "expanded" ? space.xxl : size === "medium" ? space.xl : space.lg,
      /** Altura baixa (celular deitado, janela achatada): menos espaço vertical decorativo. */
      short: height < 560,
      /** Folhas (modais) viram diálogos centralizados em telas largas. */
      dialog: width >= breakpoints.sidebar,
    } as const;
  }, [width, height]);
}

/**
 * Estilo do contêiner de conteúdo: centraliza com largura máxima e margens laterais
 * proporcionais à tela. Use em contentContainerStyle (depois do padding da tela).
 */
export function useContainer(kind: WidthKind = "content"): ViewStyle {
  const { gutter } = useLayout();
  return useMemo(() => ({ width: "100%", maxWidth: maxWidths[kind] + gutter * 2, alignSelf: "center", paddingHorizontal: gutter }), [kind, gutter]);
}

/**
 * Ajustes das folhas inferiores (Modal transparente): em telas largas viram um diálogo
 * centralizado, com cantos arredondados e altura limitada à janela.
 */
export function useSheetLayout(maxWidth = 520) {
  const { dialog, height } = useLayout();
  return useMemo(
    () => ({
      backdrop: (dialog ? { justifyContent: "center", alignItems: "center", padding: space.xl } : { justifyContent: "flex-end" }) as ViewStyle,
      sheet: (dialog
        ? { width: "100%", maxWidth, maxHeight: Math.round(height * 0.88), borderRadius: 20, borderWidth: 1 }
        : { width: "100%", maxWidth: "100%", maxHeight: Math.round(height * 0.92) }) as ViewStyle,
    }),
    [dialog, height, maxWidth],
  );
}
