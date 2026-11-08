import { useEffect, useState, type ComponentProps, type ComponentType } from "react";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import { KallyOrb } from "@/components/kally-orb";
import type { KallyOrbitalSkia } from "./orbital-skia";
import type { KallyOrbitalState } from "./activity";

export { levelFromMetering, useKallyActivity, type KallyOrbitalState } from "./activity";

/**
 * Web: o Skia precisa do CanvasKit (WebAssembly) carregado antes de qualquer componente dele
 * ser importado. Enquanto carrega (uma vez por sessão), aparece a órbita em SVG; depois, a
 * mesma KallyOrbital do celular.
 */
type Props = ComponentProps<typeof KallyOrbitalSkia>;

let loaded: Promise<ComponentType<Props>> | null = null;
function loadOrbital() {
  if (!loaded) {
    loaded = LoadSkiaWeb({ locateFile: (file) => `${process.env.EXPO_PUBLIC_WEB_BASE ?? ""}/${file}` })
      .then(() => import("./orbital-skia"))
      .then((module) => module.KallyOrbitalSkia as ComponentType<Props>);
  }
  return loaded;
}

const FALLBACK: Record<KallyOrbitalState, "idle" | "thinking" | "speaking"> = {
  idle: "idle",
  listening: "thinking",
  thinking: "thinking",
  responding: "speaking",
  speaking: "speaking",
  error: "idle",
};

export function KallyOrbital(props: Props) {
  const [Orbital, setOrbital] = useState<ComponentType<Props> | null>(null);
  useEffect(() => {
    let alive = true;
    loadOrbital()
      .then((component) => alive && setOrbital(() => component))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (Orbital) return <Orbital {...props} />;
  return <KallyOrb size={props.size} state={FALLBACK[props.state ?? "idle"]} activity={props.activity} announce={props.announce} />;
}
