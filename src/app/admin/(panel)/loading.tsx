export default function PanelLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div aria-hidden className="space-y-4">
        <div className="h-8 w-56 bg-surface-2 [animation:pulse-line_1.4s_ease-in-out_infinite]" />
        <div className="h-4 w-80 max-w-full bg-surface [animation:pulse-line_1.4s_ease-in-out_infinite]" />
        <div className="h-24 w-full bg-surface [animation:pulse-line_1.4s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
