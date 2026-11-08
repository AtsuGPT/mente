/**
 * Sistema visual do Minha Mente (app), versão 2: preto profundo tingido de roxo, superfícies
 * em camadas (cada nível um pouco mais claro e mais roxo), gradientes discretos e o violeta
 * como cor de identidade e de interação.
 *
 * Contrastes sobre bg (#050309): text 18.0:1, muted 8.1:1, faint 5.0:1, violet300 11.2:1,
 * violet400 7.4:1. violet500 só para linhas, brilhos e preenchimentos. Texto branco sobre o
 * gradiente primário (pior ponto #5B2FD6): 7.2:1.
 */

export const colors = {
  bg: "#050309",
  /** Topo das telas: o fundo começa um pouco mais roxo e escurece para baixo. */
  bgTop: "#0D0719",
  surface: "#0D0918",
  surfaceRaised: "#151026",
  surfacePressed: "#1F1736",
  glass: "rgba(21,16,38,0.82)",

  line: "#211936",
  lineStrong: "#352957",

  violet950: "#130B26",
  violet900: "#1E1240",
  violet800: "#2F1C64",
  violet700: "#4A2B9B",
  violet600: "#6236D4",
  violet500: "#8461F0",
  violet400: "#A58BF7",
  violet300: "#C7B7FA",
  violet200: "#E4DBFD",
  /** Acento quente das auroras e da Kally (nunca para texto). */
  orchid: "#B65CF2",

  text: "#F2EFFA",
  muted: "#AAA4BF",
  faint: "#867FA1",

  danger: "#F2777A",
  dangerSoft: "#3A1418",
  success: "#8FDDB0",
  warning: "#E8C07D",
} as const;

export const accent = {
  primary: colors.violet600,
  primaryText: colors.violet300,
  primaryPressed: colors.violet700,
  primarySoft: colors.violet900,
  ring: colors.violet400,
} as const;

/** Gradientes (início → fim). Sempre discretos: profundidade, não decoração. */
export const gradients = {
  /** Fundo das telas, de cima para baixo. */
  screen: [colors.bgTop, colors.bg] as const,
  /** Botão primário, pílula da aba ativa, envio. */
  primary: ["#8A5CF6", "#5B2FD6"] as const,
  primaryPressed: ["#7445E6", "#4A25B6"] as const,
  /** Corpo das superfícies: mais claro no alto (luz de cima). */
  surface: ["#171129", "#0C0816"] as const,
  surfaceRaised: ["#1F1736", "#120D22"] as const,
  /** Borda das superfícies: brilho no canto superior que some para baixo. */
  border: ["rgba(165,139,247,0.34)", "rgba(165,139,247,0.05)"] as const,
  borderActive: ["rgba(199,183,250,0.75)", "rgba(132,97,240,0.25)"] as const,
  /** Bolha das mensagens da pessoa. */
  bubble: ["#5E35D2", "#3D2196"] as const,
} as const;

export const fonts = {
  serif: "Newsreader_400Regular",
  serifItalic: "Newsreader_400Regular_Italic",
  serifMedium: "Newsreader_500Medium",
  sans: "InstrumentSans_400Regular",
  sansMedium: "InstrumentSans_500Medium",
  sansSemibold: "InstrumentSans_600SemiBold",
} as const;

export const type = {
  hero: { fontFamily: fonts.serifMedium, fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  display: { fontFamily: fonts.serif, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: fonts.serifMedium, fontSize: 27, lineHeight: 33, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.sansSemibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 28 },
  ui: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  uiMedium: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: "uppercase" as const },
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 } as const;

/** Sombras (iOS/web) e elevação (Android) das camadas. */
export const elevation = {
  card: { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  float: { shadowColor: "#2A1060", shadowOpacity: 0.55, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 12 },
  glow: { shadowColor: colors.violet500, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
} as const;

export const motion = { fast: 140, base: 220, slow: 420 } as const;
