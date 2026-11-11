import { createContext, useContext, type ReactNode } from "react";
import { useWindowDimensions } from "react-native";

/**
 * Escala do texto pelo tamanho da tela (soma-se ao tamanho de fonte escolhido no sistema, que
 * continua valendo). Celulares estreitos encolhem um pouco, para títulos não quebrarem em três
 * linhas nem empurrarem o conteúdo; tablets e telas largas crescem um pouco, para o texto não
 * parecer miúdo à distância maior de leitura. Entre 360 e 599 px (a maioria dos celulares) nada muda.
 */
export function typeScaleFor(width: number) {
  if (width < 340) return 0.9;
  if (width < 360) return 0.95;
  if (width >= 1024) return 1.06;
  if (width >= 600) return 1.04;
  return 1;
}

const TypeScale = createContext(1);

/** Um só ouvinte do tamanho da janela para todos os textos (e não um por texto). */
export function TypeScaleProvider({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  return <TypeScale.Provider value={typeScaleFor(width)}>{children}</TypeScale.Provider>;
}

export const useTypeScale = () => useContext(TypeScale);
