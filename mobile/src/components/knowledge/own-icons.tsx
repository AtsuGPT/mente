/**
 * Ícones próprios da Mente dentro do mapa (redesign de 27/11): os mesmos desenhos de components/ui/icon.tsx (contorno
 * fino, preenchimento quase transparente), aqui em SVG de navegador, porque o mapa roda como componente DOM.
 * Servem ao explorador, ao inspetor, aos nós do Estruturado e, como texto SVG, aos nomes do Relacional (Sigma).
 */
export type OwnIconKind = "pastas" | "pensamentos" | "rascunho" | "conversas" | "artefatos" | "topicos" | "materiais" | "grupo";

const DOT = `fill="currentColor" fill-opacity="0.9" stroke="none"`;
const PATHS: Record<OwnIconKind, string> = {
  pastas: `<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="M3.5 10h17" fill="none"/>`,
  pensamentos: `<path d="M12 4c4.4 0 7.5 3 7.5 7s-3.1 7.4-7.5 7.4c-1.2 0-2.3-.2-3.3-.6L5 19.5l1.1-3.4C5 14.8 4.5 13 4.5 11 4.5 7 7.6 4 12 4Z"/><circle cx="12" cy="11" r="1.6" ${DOT}/>`,
  rascunho: `<path d="M12 4c4.4 0 7.5 3 7.5 7s-3.1 7.4-7.5 7.4c-1.2 0-2.3-.2-3.3-.6L5 19.5l1.1-3.4C5 14.8 4.5 13 4.5 11 4.5 7 7.6 4 12 4Z" stroke-dasharray="2.4 2.2"/>`,
  conversas: `<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h8A2.5 2.5 0 0 1 17 6.5v4a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3A2.5 2.5 0 0 1 4 10.5Z"/><path d="M19 9.5a2 2 0 0 1 1 1.8v3.2a2 2 0 0 1-2 2h-.5V19L15 16.5h-3" fill="none"/>`,
  artefatos: `<path d="M12 3.5 19.5 7.6v8.8L12 20.5l-7.5-4.1V7.6Z"/><path d="M4.5 7.6 12 11.7l7.5-4.1M12 11.7v8.8" fill="none"/>`,
  topicos: `<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6" ${DOT}/>`,
  materiais: `<path d="M8 3.5h8.5a2 2 0 0 1 2 2V16" fill="none"/><path d="M7 6h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><path d="M8 11h5M8 14h5M8 17h3" fill="none"/>`,
  grupo: `<path d="M12 4 3.5 8.3 12 12.6l8.5-4.3Z"/><path d="m3.5 12.2 8.5 4.3 8.5-4.3M3.5 16l8.5 4.3 8.5-4.3" fill="none"/>`,
};

/** O SVG como texto (para o Sigma desenhar ao lado do nome), na cor e no tamanho pedidos. */
export function ownIconSvg(kind: OwnIconKind, color: string, size: number, strokeWidth = 1.6) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" color="${color}" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${PATHS[kind]}</svg>`;
}

export function OwnIcon({ kind, size = 16, strokeWidth = 1.6 }: { kind: OwnIconKind; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillOpacity={0.1}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: PATHS[kind] }}
    />
  );
}
