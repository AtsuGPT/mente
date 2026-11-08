import { useEffect, useMemo, useRef } from "react";
import { diagramHtml, readDiagramMessage } from "@/lib/structured";

export type SurfaceResult = { type: "ok"; height: number; width: number } | { type: "error"; message: string };

/**
 * Web: o diagrama é desenhado num iframe com sandbox só de scripts (sem mesma origem): o código
 * do diagrama não tem acesso à página, aos cookies nem à sessão do app.
 */
export function DiagramSurface({ source, id, fit, height, onResult }: { source: string; id: string; fit: boolean; height: number | "fill"; onResult: (result: SurfaceResult) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => diagramHtml({ source, id, fit }), [source, id, fit]);
  const latest = useRef(onResult);
  latest.current = onResult;
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const result = readDiagramMessage(event.data, id);
      if (result) latest.current(result);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [id]);
  return (
    <iframe
      ref={frame}
      title="Diagrama"
      sandbox="allow-scripts"
      srcDoc={html}
      style={{ width: "100%", height: height === "fill" ? "100%" : height, border: 0, background: "transparent", display: "block" }}
    />
  );
}
