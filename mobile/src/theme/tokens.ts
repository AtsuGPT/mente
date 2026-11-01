/**
 * Sistema visual do Minha Mente (app): escuro, com o roxo como identidade.
 * O roxo marca o que é interativo ou selecionado; cinzas carregam o secundário.
 * Contrastes medidos sobre bg: text 16.9:1, muted 7.6:1, violet300 10.2:1, violet400 6.7:1.
 * faint (3.8:1) só para rótulos e detalhes; violet500 (4.3:1) só para linhas e
 * preenchimentos, nunca para texto. Botão primário: branco sobre violet600 = 7.9:1.
 */

export const colors = {
  bg: "#07060B",
  surface: "#0D0B14",
  surfaceRaised: "#14101F",
  surfacePressed: "#1B1529",

  line: "#1F1830",
  lineStrong: "#2E2447",

  violet950: "#120C22",
  violet900: "#1D1336",
  violet800: "#2C1C55",
  violet700: "#432A80",
  violet600: "#5B3AAE",
  violet500: "#7C5CE0",
  violet400: "#9D84F0",
  violet300: "#BFAEF7",
  violet200: "#DDD3FB",

  text: "#ECE9F5",
  muted: "#A19CB3",
  faint: "#6E6884",

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

export const fonts = {
  serif: "Newsreader_400Regular",
  serifItalic: "Newsreader_400Regular_Italic",
  serifMedium: "Newsreader_500Medium",
  sans: "InstrumentSans_400Regular",
  sansMedium: "InstrumentSans_500Medium",
  sansSemibold: "InstrumentSans_600SemiBold",
} as const;

export const type = {
  display: { fontFamily: fonts.serif, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: fonts.serifMedium, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.sansSemibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 28 },
  ui: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  uiMedium: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.sansMedium, fontSize: 11, lineHeight: 14, letterSpacing: 1.4, textTransform: "uppercase" as const },
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const motion = { fast: 140, base: 220, slow: 420 } as const;
