import { Image } from "expo-image";
import type { StyleProp, ImageStyle } from "react-native";

/**
 * Ícones próprios da Mente (redesign de 27/11): obsidiana preta com reflexos claros, renderizados uma vez em 3D
 * (a cena está na prévia do redesign) e guardados como imagem: nada de WebGL na tela. Abaixo de ~32 px use o
 * contorno do mesmo desenho (Icon, com o mesmo nome), que continua legível.
 */
const SOURCES = {
  estudos: require("../../../assets/icons/estudos.png"),
  pensamentos: require("../../../assets/icons/pensamentos.png"),
  artefatos: require("../../../assets/icons/artefatos.png"),
  ambientes: require("../../../assets/icons/ambientes.png"),
  mapas: require("../../../assets/icons/mapas.png"),
  pastas: require("../../../assets/icons/pastas.png"),
  materiais: require("../../../assets/icons/materiais.png"),
  conversas: require("../../../assets/icons/conversas.png"),
  topicos: require("../../../assets/icons/topicos.png"),
  participantes: require("../../../assets/icons/participantes.png"),
} as const;

export type GlassIconName = keyof typeof SOURCES;

export function GlassIcon({ name, size = 48, style }: { name: GlassIconName; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={SOURCES[name]} style={[{ width: size, height: size }, style]} contentFit="contain" accessibilityIgnoresInvertColors aria-hidden />;
}
