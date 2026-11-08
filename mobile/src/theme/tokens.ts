/**
 * Sistema visual do Minha Mente (app e site), versão 3: preto como base absoluta, cinzas muito
 * escuros (com um sopro de violeta) para dar profundidade, e o roxo só onde ele significa algo:
 * interação, seleção, estado e a identidade da Kally. Nada de fundos iluminados nem grandes
 * superfícies roxas; gradientes só como luz sutil.
 *
 * Contrastes sobre bg (#000): text 19.4:1, muted 8.7:1, faint 5.3:1, violet300 12.0:1,
 * violet400 7.9:1. violet500 só para linhas, brilhos e preenchimentos. Texto branco sobre o
 * roxo primário (pior ponto #5F33D2): 7.0:1.
 */

export const colors = {
  bg: "#000000",
  /** Topo das telas e cabeçalhos: o mesmo preto (o fundo não é mais tingido). */
  bgTop: "#000000",
  surface: "#0B0A0E",
  surfaceRaised: "#131217",
  surfacePressed: "#1C1A22",
  glass: "rgba(14,13,18,0.88)",

  line: "#1C1A22",
  lineStrong: "#2A2732",

  violet950: "#130B26",
  violet900: "#1E1240",
  violet800: "#2F1C64",
  violet700: "#4A2B9B",
  violet600: "#6236D4",
  violet500: "#8461F0",
  violet400: "#A58BF7",
  violet300: "#C7B7FA",
  violet200: "#E4DBFD",
  /** Acento quente da Kally (nunca para texto). */
  orchid: "#B65CF2",

  text: "#F2EFFA",
  muted: "#AAA4BF",
  faint: "#867FA1",

  danger: "#F2777A",
  dangerSoft: "#2A1013",
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

/** Roxo translúcido para seleção e estados ativos (sem pintar superfícies inteiras). */
export const tint = {
  /** Fundo de item selecionado (aba, chip, linha). */
  selected: "rgba(132,97,240,0.16)",
  /** Borda de item selecionado. */
  selectedBorder: "rgba(165,139,247,0.38)",
  /** Toque/hover em superfícies neutras. */
  pressed: "rgba(255,255,255,0.05)",
} as const;

/** Gradientes (início → fim). Sempre discretos: profundidade, não decoração. */
export const gradients = {
  /** Fundo das telas: preto puro (mantido como par para quem desenha o fundo). */
  screen: [colors.bg, colors.bg] as const,
  /** Botão primário e envio: roxo quase chapado, com luz leve no alto. */
  primary: ["#7246E4", "#5A30CB"] as const,
  primaryPressed: ["#6A40DC", "#4E28B8"] as const,
  /** Corpo das superfícies: cinza quase preto, um pouco mais claro no alto. */
  surface: ["#0F0E13", "#0A090D"] as const,
  surfaceRaised: ["#17151C", "#111015"] as const,
  /** Borda das superfícies: fio claro e neutro que se apaga para baixo. */
  border: ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.04)"] as const,
  borderActive: ["rgba(165,139,247,0.62)", "rgba(132,97,240,0.2)"] as const,
  /** Mensagens da pessoa: cinza escuro levemente violeta (o roxo fica no fio da borda). */
  bubble: ["#1A1724", "#15121E"] as const,
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
  hero: { fontFamily: fonts.serifMedium, fontSize: 34, lineHeight: 39, letterSpacing: -0.8 },
  display: { fontFamily: fonts.serif, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: fonts.serifMedium, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.sansSemibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 27 },
  ui: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  uiMedium: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.sansMedium, fontSize: 11.5, lineHeight: 15, letterSpacing: 1.2, textTransform: "uppercase" as const },
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 } as const;

/**
 * Elevação. Sobre preto, sombra não aparece: a profundidade vem da superfície mais clara e do
 * fio da borda. Ficam só uma sombra preta para o que flutua e um brilho roxo contido.
 */
export const elevation = {
  card: { shadowColor: "#000", shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  float: { shadowColor: "#000", shadowOpacity: 0.7, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  glow: { shadowColor: colors.violet500, shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
} as const;

export const motion = { fast: 140, base: 220, slow: 420 } as const;
