"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { savePostAction } from "@/app/admin/actions";
import { ThoughtArticle } from "@/components/thought-article";
import { accentVars } from "@/lib/color";
import { fromDatetimeLocal } from "@/lib/format";
import { readingMinutes, stripMarkdown } from "@/lib/text";
import { slugify } from "@/lib/slug";
import type { CategorySummary } from "@/server/categories";
import type { ActionState } from "@/server/validation";
import { SubmitButton } from "./submit-button";

export type EditorPost = {
  id: string;
  number: number;
  title: string;
  slug: string;
  content: string;
  status: "DRAFT" | "PUBLISHED";
  /** Valor para <input type="datetime-local">, em horário de Brasília. */
  publishedAtLocal: string;
};

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-2 text-sm text-danger" role="alert">
      {errors[0]}
    </p>
  );
}

export function PostEditor({ post, categories, selectedIds }: { post: EditorPost | null; categories: CategorySummary[]; selectedIds: string[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(savePostAction.bind(null, post?.id ?? null), {
    ok: false,
  });

  const isNew = post === null;
  const isPublished = post?.status === "PUBLISHED";

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [content, setContent] = useState(post?.content ?? "");
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [publishedLocal, setPublishedLocal] = useState(post?.publishedAtLocal ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [dirty, setDirty] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  const fieldErrors = state.fieldErrors ?? {};

  // Depois de salvar com sucesso, não há mais nada pendente. Cada envio devolve um
  // novo objeto de estado; ajustar o estado durante a renderização evita um efeito.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setDirty(false);
  }

  // Avisa antes de fechar a aba com texto não salvo.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Ctrl/Cmd + S salva sem publicar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (formRef.current && saveRef.current && !saveRef.current.disabled) {
          formRef.current.requestSubmit(saveRef.current);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const touch = () => setDirty(true);

  const words = stripMarkdown(content).split(/\s+/).filter(Boolean).length;
  const slugChangedOnPublished = isPublished && post && slug !== post.slug;
  const previewCategories = categories.filter((c) => selected.includes(c.id));

  return (
    <form ref={formRef} action={formAction} className="pb-0" noValidate>
      {/*
        Primeiro botão de envio do formulário = ação do Enter nos campos de texto e do Ctrl+S.
        Fica no topo de propósito: o Enter nunca deve acionar "publicar" nem "voltar a rascunho".
      */}
      <button ref={saveRef} type="submit" name="intent" value="save" hidden tabIndex={-1} aria-hidden />

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-16">
        {/* ------------------------------ Escrita ------------------------------ */}
        <div className="min-w-0">
          <div className={tab === "preview" ? "hidden" : ""}>
            <label htmlFor="title" className="label">
              Título
            </label>
            <input
              id="title"
              name="title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
                touch();
              }}
              placeholder="Sobre o que você está pensando?"
              maxLength={200}
              autoFocus={isNew}
              aria-invalid={!!fieldErrors.title}
              aria-describedby={fieldErrors.title ? "title-error" : undefined}
              className="input mt-2 font-serif text-[2rem] font-light leading-tight tracking-[-0.02em] md:text-[2.6rem]"
            />
            <FieldError id="title-error" errors={fieldErrors.title} />
          </div>

          <div className="mt-8 flex items-baseline justify-between gap-6" role="tablist" aria-label="Modo do editor">
            <div className="flex gap-6">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`label border-b pb-1 transition-colors ${
                    tab === t ? "border-fg text-fg" : "border-transparent hover:text-fg"
                  }`}
                >
                  {t === "write" ? "Escrever" : "Prévia"}
                </button>
              ))}
            </div>
            <p className="label text-faint" aria-live="off">
              {words} {words === 1 ? "palavra" : "palavras"} · {readingMinutes(content)} min
            </p>
          </div>

          <div className="mt-6">
            <label htmlFor="content" className="sr-only">
              Texto
            </label>
            <textarea
              id="content"
              name="content"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                touch();
              }}
              placeholder="Escreva livremente. Markdown é opcional."
              aria-invalid={!!fieldErrors.content}
              aria-describedby={fieldErrors.content ? "content-error" : "content-hint"}
              className={`field-sizing-content block min-h-[55vh] w-full resize-none border border-line bg-transparent p-5 font-serif text-[1.2rem] leading-[1.75] text-fg placeholder:text-faint hover:border-[#444] focus-visible:border-fg focus-visible:outline-none md:p-7 ${
                tab === "preview" ? "hidden" : ""
              }`}
            />
            <FieldError id="content-error" errors={fieldErrors.content} />
            {tab === "write" ? (
              <p id="content-hint" className="label mt-3 normal-case tracking-normal text-faint">
                Markdown: ## título · **negrito** · *itálico* · &gt; citação · - lista · [texto](https://link)
              </p>
            ) : null}

            {tab === "preview" ? (
              <div className="border border-line px-5 pb-10 md:px-10">
                <p className="label pt-5 text-faint">Prévia do texto em edição. Nada foi publicado.</p>
                <ThoughtArticle
                  preview
                  post={{
                    number: post?.number ?? 0,
                    title: title.trim() || "Sem título",
                    content: content || "*Nada escrito ainda.*",
                    publishedAt: fromDatetimeLocal(publishedLocal),
                    categories: previewCategories,
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* ------------------------------ Metadados ----------------------------- */}
        <aside className="space-y-9 lg:pt-1" aria-label="Detalhes do pensamento">
          <div>
            <label htmlFor="slug" className="label">
              Endereço
            </label>
            <div className="mt-2 flex items-baseline font-sans text-sm text-faint">
              <span className="shrink-0">/pensamento/</span>
              <input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                  touch();
                }}
                onBlur={() => setSlug((s) => slugify(s, 120))}
                maxLength={120}
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={!!fieldErrors.slug}
                aria-describedby={fieldErrors.slug ? "slug-error" : undefined}
                className="input min-w-0 flex-1"
              />
            </div>
            <FieldError id="slug-error" errors={fieldErrors.slug} />
            {slugChangedOnPublished ? (
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Este pensamento já está publicado. Mudar o endereço quebra links que já foram compartilhados.
              </p>
            ) : null}
          </div>

          <fieldset>
            <legend className="label">Categorias</legend>
            {categories.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Nenhuma categoria ainda. Crie uma em <em>Categorias</em>.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {categories.map((c) => {
                  const checked = selected.includes(c.id);
                  return (
                    <label key={c.id} style={accentVars(c.color)} className="cursor-pointer">
                      <input
                        type="checkbox"
                        name="categoryIds"
                        value={c.id}
                        checked={checked}
                        onChange={() => {
                          setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]));
                          touch();
                        }}
                        className="peer sr-only"
                      />
                      <span className="label inline-flex items-center gap-2 border border-line px-3 py-2 transition-colors peer-checked:border-(--accent) peer-checked:text-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg hover:border-[#444]">
                        <span aria-hidden className={`h-[2px] w-3 bg-(--accent) ${checked ? "" : "opacity-40"}`} />
                        {c.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div>
            <label htmlFor="publishedAt" className="label">
              Data de publicação
            </label>
            <input
              id="publishedAt"
              name="publishedAt"
              type="datetime-local"
              value={publishedLocal}
              onChange={(e) => {
                setPublishedLocal(e.target.value);
                touch();
              }}
              aria-invalid={!!fieldErrors.publishedAt}
              aria-describedby="publishedAt-hint"
              className="input mt-2"
            />
            <FieldError id="publishedAt-error" errors={fieldErrors.publishedAt} />
            <p id="publishedAt-hint" className="mt-2 text-sm leading-relaxed text-faint">
              Horário de Brasília. Em branco, vale o momento da publicação. Uma data futura agenda o texto.
            </p>
          </div>

          {post ? (
            <p>
              <a
                href={`/admin/previa/${post.id}`}
                target="_blank"
                rel="noopener"
                className="btn-link text-muted hover:text-fg"
              >
                Abrir prévia no site <span aria-hidden>↗</span>
              </a>
              <span className="mt-2 block text-sm text-faint">Mostra a versão já salva, no layout real.</span>
            </p>
          ) : null}
        </aside>
      </div>

      {/* ------------------------------ Barra de ações ------------------------- */}
      <div className="sticky bottom-0 z-20 mt-14 border-t border-line bg-bg py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <p
            role={state.message && !state.ok ? "alert" : "status"}
            aria-live="polite"
            className={`min-h-5 font-sans text-sm ${state.ok ? "text-fg" : "text-danger"}`}
          >
            {state.message ?? (dirty ? <span className="text-muted">Alterações não salvas.</span> : null)}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {isPublished ? (
              <>
                <SubmitButton name="intent" value="unpublish" variant="default">
                  Voltar a rascunho
                </SubmitButton>
                <SubmitButton name="intent" value="save" variant="primary">
                  Salvar alterações
                </SubmitButton>
              </>
            ) : (
              <>
                <SubmitButton name="intent" value="save">
                  Salvar rascunho
                </SubmitButton>
                <SubmitButton name="intent" value="publish" variant="primary" pendingLabel="Publicando…">
                  Publicar
                </SubmitButton>
              </>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
