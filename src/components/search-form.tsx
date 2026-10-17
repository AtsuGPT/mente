"use client";

import { useState } from "react";
import type { CategorySummary } from "@/server/categories";

export function SearchForm({
  categories,
  values = {},
  compact = false,
}: {
  categories: CategorySummary[];
  values?: { q?: string; categoria?: string; de?: string; ate?: string };
  compact?: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(Boolean(values.categoria || values.de || values.ate));

  return (
    <form action="/buscar" method="get" role="search" className="site-search-form">
      <label className="sr-only" htmlFor={compact ? "home-q" : "search-q"}>Buscar palavras nos pensamentos</label>
      <div className="site-search-toolbar">
        <input
          id={compact ? "home-q" : "search-q"}
          name="q"
          type="search"
          defaultValue={values.q}
          placeholder="Buscar nos pensamentos"
          className="site-search-input"
        />
        <button
          type="button"
          className={`site-filter-toggle ${filtersOpen ? "is-active" : ""}`}
          aria-expanded={filtersOpen}
          aria-controls={compact ? "home-search-filters" : "search-filters"}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M7 12h10m-7 6h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>Filtrar</span>
        </button>
        <button type="submit" className="site-search-submit">Buscar</button>
      </div>

      {filtersOpen ? <div id={compact ? "home-search-filters" : "search-filters"} className="site-search-filters">
        <label className="site-search-field">
          <span>Categoria</span>
          <select name="categoria" defaultValue={values.categoria ?? ""}>
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>{category.name}</option>
            ))}
          </select>
        </label>

        <label className="site-search-field">
          <span>De</span>
          <input type="date" name="de" defaultValue={values.de} />
        </label>

        <label className="site-search-field">
          <span>Até</span>
          <input type="date" name="ate" defaultValue={values.ate} />
        </label>

      </div> : null}
    </form>
  );
}