import { useEffect, useMemo, useRef } from "react";
import { artifactHtml, readSurfaceMessage, type SurfaceMessage } from "@/lib/artifact";

/**
 * Web: o artefato roda num iframe com sandbox só de scripts, SEM "allow-same-origin". A página do artefato fica com
 * origem opaca: não lê cookies, armazenamento, o token nem o DOM do app, não abre janelas, não navega a página de cima e
 * não envia formulários. A CSP colocada no começo da página (artifactHtml) bloqueia a rede. O app só aceita mensagens
 * que vêm desse iframe (event.source) e trazem o id dele.
 */
export function ArtifactSurface({ source, id, height, scroll, onMessage }: { source: string; id: string; height: number | "fill"; scroll: boolean; onMessage: (message: SurfaceMessage) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => artifactHtml({ source, id }), [source, id]);
  const latest = useRef(onMessage);
  latest.current = onMessage;
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = readSurfaceMessage(event.data, id);
      if (message) latest.current(message);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [id]);
  return (
    <iframe
      ref={frame}
      title="Artefato"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={html}
      scrolling={scroll ? "auto" : "no"}
      style={{ width: "100%", height: height === "fill" ? "100%" : height, border: 0, background: "transparent", display: "block" }}
    />
  );
}
