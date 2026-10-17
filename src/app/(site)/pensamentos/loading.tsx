export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="pt-24 md:pt-40">
      <span className="sr-only">Carregando…</span>
      <div aria-hidden className="space-y-5">
        <div className="h-px w-12 bg-line [animation:pulse-line_1.4s_ease-in-out_infinite]" />
        <div className="h-10 w-3/4 max-w-xl bg-surface-2 [animation:pulse-line_1.4s_ease-in-out_infinite]" />
        <div className="h-4 w-1/2 max-w-md bg-surface [animation:pulse-line_1.4s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
