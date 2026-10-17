/**
 * Um template é remontado a cada navegação, o que dispara a entrada suave
 * da página (CSS puro, desativada com prefers-reduced-motion).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
