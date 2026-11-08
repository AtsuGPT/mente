import { Platform } from "react-native";
import { Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from "react-native-reanimated";

/**
 * Sistema de movimento do Minha Mente. Cada tipo de movimento tem a sua duração e curva:
 * o que é toque responde rápido, o que muda de lugar desacelera, o que é ambiente é lento.
 * Tudo respeita "reduzir movimento" do sistema (ReduceMotion.System): o valor final é
 * aplicado sem animação, e os laços ambientais nem começam (ver useAmbientActive).
 */

/** Durações em ms (referência: micro 100–180, comum 180–300, navegação 250–400, expansão 300–500). */
export const duration = {
  micro: 140,
  short: 200,
  medium: 260,
  navigation: 320,
  expand: 420,
} as const;

/**
 * Curvas (cúbicas de Bézier). standard: mudanças no próprio lugar. decelerate: o que entra
 * na tela (chega rápido e assenta). accelerate: o que sai (some sem chamar atenção).
 */
export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.bezier(0.05, 0.7, 0.1, 1),
  accelerate: Easing.bezier(0.3, 0, 0.8, 0.15),
  /** Laços ambientais (respiração, oscilação de cor). */
  breathe: Easing.inOut(Easing.sin),
} as const;

const system = { reduceMotion: ReduceMotion.System } as const;

export const timing = {
  micro: { duration: duration.micro, easing: easing.standard, ...system },
  short: { duration: duration.short, easing: easing.standard, ...system },
  enter: { duration: duration.medium, easing: easing.decelerate, ...system },
  exit: { duration: duration.short, easing: easing.accelerate, ...system },
  navigation: { duration: duration.navigation, easing: easing.standard, ...system },
} satisfies Record<string, WithTimingConfig>;

/**
 * Molas com duração perceptual e amortecimento (dampingRatio < 1 = um leve assentar,
 * nunca oscilação visível). A duração real é ~1,5× a perceptual.
 */
export const spring = {
  /** Afundar ao pressionar: chega quase no mesmo quadro do toque, sem rebote. */
  press: { duration: 110, dampingRatio: 1, ...system },
  /** Voltar ao soltar: assenta sem passar do ponto (amortecimento alto). */
  release: { duration: 260, dampingRatio: 0.86, ...system },
  /** Indicadores de seleção (abas, chips) indo de um lugar a outro. */
  selection: { duration: 320, dampingRatio: 0.92, ...system },
  /** Folhas e diálogos entrando. */
  sheet: { duration: 380, dampingRatio: 0.95, ...system },
  /** Câmera do mapa (focar, enquadrar, aproximar). */
  camera: { duration: 460, dampingRatio: 1, ...system },
  /** Destaque de um nó selecionado: discreto, sem balanço. */
  pop: { duration: 260, dampingRatio: 0.95, ...system },
  /** Mudanças de estado contínuas (órbita da Kally): lentas e criticamente amortecidas. */
  state: { duration: 1100, dampingRatio: 1, ...system },
} satisfies Record<string, WithSpringConfig>;

/**
 * Deslocamento inicial curto (só no celular). Na web, o Reanimated 4 transforma entradas com
 * withInitialValues em keyframes próprios e, ao terminar, deixa o elemento com position
 * absolute: ele sai do fluxo e as listas perdem a altura real (o chat deixava de acompanhar o
 * fim). Lá ficam os presets padrão (FadeInDown sobe 25 px), que não têm esse efeito.
 */
type Rising = ReturnType<typeof FadeInDown.duration>;
function lift(builder: Rising, distance: number): Rising {
  return Platform.OS === "web" ? builder : ((builder as unknown as FadeInDown).withInitialValues({ opacity: 0, transform: [{ translateY: distance }] }) as unknown as Rising);
}

/** Entradas e saídas de elementos (layout animations), com deslocamento curto. */
export const enter = {
  fade: FadeIn.duration(duration.short).easing(easing.decelerate).reduceMotion(ReduceMotion.System),
  rise: lift(FadeInDown.duration(duration.medium).easing(easing.decelerate).reduceMotion(ReduceMotion.System), 10),
  /** Painéis que sobem do fim da tela (detalhes do mapa). */
  panel: lift(FadeInDown.duration(duration.navigation).easing(easing.decelerate).reduceMotion(ReduceMotion.System), 48),
  /** Itens de lista em sequência: atraso curto e limitado (não espera a lista inteira). */
  stagger: (index: number) =>
    lift(
      FadeInDown.duration(duration.medium)
        .delay(Math.min(index, 6) * 45)
        .easing(easing.decelerate)
        .reduceMotion(ReduceMotion.System),
      10,
    ),
} as const;

export const exit = {
  fade: FadeOut.duration(duration.micro).easing(easing.accelerate).reduceMotion(ReduceMotion.System),
  panel: FadeOutDown.duration(duration.short).easing(easing.accelerate).reduceMotion(ReduceMotion.System),
} as const;

/** Elementos que mudam de tamanho/posição quando outros entram ou saem (sem saltos). */
export const layoutTransition = LinearTransition.duration(duration.medium).easing(easing.standard).reduceMotion(ReduceMotion.System);
