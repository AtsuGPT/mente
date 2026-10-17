export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border-t border-line py-16 md:py-24">
      <p className="text-2xl italic text-fg md:text-3xl">{title}</p>
      {children ? <p className="mt-4 max-w-[46ch] text-lg text-muted">{children}</p> : null}
    </div>
  );
}
