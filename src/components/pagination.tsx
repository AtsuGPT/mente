import Link from "next/link";

function hrefFor(basePath: string, page: number) {
  if (page <= 1) return basePath;
  return `${basePath}${basePath.includes("?") ? "&" : "?"}pagina=${page}`;
}

export function Pagination({ page, pageCount, basePath }: { page: number; pageCount: number; basePath: string }) {
  if (pageCount <= 1) return null;

  const hasNewer = page > 1;
  const hasOlder = page < pageCount;
  const base = "label inline-flex items-center gap-2 border-b pb-1 transition-colors";

  return (
    <nav aria-label="Paginação" className="mt-4 flex items-baseline justify-between gap-6 border-t border-line pt-8">
      {hasNewer ? (
        <Link href={hrefFor(basePath, page - 1)} rel="prev" className={`${base} border-line hover:border-fg hover:text-fg`}>
          <span aria-hidden>←</span> Mais recentes
        </Link>
      ) : (
        <span aria-hidden className="w-24" />
      )}

      <p className="label text-faint" aria-live="polite">
        Página {page} de {pageCount}
      </p>

      {hasOlder ? (
        <Link href={hrefFor(basePath, page + 1)} rel="next" className={`${base} border-line hover:border-fg hover:text-fg`}>
          Mais antigos <span aria-hidden>→</span>
        </Link>
      ) : (
        <span aria-hidden className="w-24" />
      )}
    </nav>
  );
}

/** Lê ?pagina= de forma tolerante. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1;
}
