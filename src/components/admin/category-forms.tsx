"use client";

import { useActionState, useRef, useState } from "react";
import { deleteCategoryAction, saveCategoryAction } from "@/app/admin/actions";
import { accentVars, contrastRatio, HEX_COLOR, readableAccent } from "@/lib/color";
import { slugify } from "@/lib/slug";
import type { CategorySummary } from "@/server/categories";
import type { ActionState } from "@/server/validation";
import { ConfirmDelete } from "./confirm-delete";
import { SubmitButton } from "./submit-button";

function Err({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-danger">
      {errors[0]}
    </p>
  );
}

function ColorField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string[] }) {
  const valid = HEX_COLOR.test(value);
  const text = valid ? readableAccent(value) : "#929292";
  const raw = valid ? contrastRatio(value, "#080808") : 0;

  return (
    <div>
      <span className="label">Cor de destaque</span>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="color"
          aria-label="Escolher cor"
          value={valid ? value.toLowerCase() : "#929292"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 cursor-pointer border border-line bg-transparent p-0.5"
        />
        <input
          name="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="none"
          aria-label="Cor em hexadecimal"
          aria-invalid={!valid || !!error}
          className="input w-28 font-mono"
        />
        <span style={accentVars(valid ? value : null)} className="label inline-flex items-center gap-2 text-(--accent-text)">
          <span aria-hidden className="h-[2px] w-3 bg-(--accent)" />
          Exemplo
        </span>
      </div>
      <Err errors={error} />
      {valid ? (
        <p className="mt-2 text-sm text-faint">
          Como texto, a cor é clareada para {text} (contraste de {raw.toFixed(1)}:1 {raw < 4.5 ? "→ ajustado para 4,5:1 ou mais" : "no fundo preto"}).
        </p>
      ) : null}
    </div>
  );
}

function CategoryFields({
  category,
  state,
  onReset,
}: {
  category: CategorySummary | null;
  state: ActionState;
  onReset?: boolean;
}) {
  const errors = state.fieldErrors ?? {};
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [description, setDescription] = useState(category?.description ?? "");
  const [color, setColor] = useState(category?.color ?? "#929292");

  // Formulário de criação: limpa os campos depois de salvar. Cada envio devolve um
  // novo objeto de estado; ajustar o estado durante a renderização evita um efeito.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (onReset && state.ok) {
      setName("");
      setSlug("");
      setSlugTouched(false);
      setDescription("");
      setColor("#929292");
    }
  }

  return (
    <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">
      <div>
        <label className="label" htmlFor={`name-${category?.id ?? "new"}`}>
          Nome
        </label>
        <input
          id={`name-${category?.id ?? "new"}`}
          name="name"
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value, 60));
          }}
          aria-invalid={!!errors.name}
          className="input mt-2"
        />
        <Err errors={errors.name} />
      </div>

      <div>
        <label className="label" htmlFor={`slug-${category?.id ?? "new"}`}>
          Endereço
        </label>
        <div className="mt-2 flex items-baseline font-sans text-sm text-faint">
          <span className="shrink-0">/categoria/</span>
          <input
            id={`slug-${category?.id ?? "new"}`}
            name="slug"
            value={slug}
            maxLength={120}
            spellCheck={false}
            autoCapitalize="none"
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            onBlur={() => setSlug((s) => slugify(s, 120))}
            aria-invalid={!!errors.slug}
            className="input min-w-0 flex-1"
          />
        </div>
        <Err errors={errors.slug} />
      </div>

      <div className="md:col-span-2">
        <label className="label" htmlFor={`desc-${category?.id ?? "new"}`}>
          Descrição
        </label>
        <input
          id={`desc-${category?.id ?? "new"}`}
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={280}
          placeholder="Uma frase curta, exibida na página inicial e no topo da categoria."
          aria-invalid={!!errors.description}
          className="input mt-2"
        />
        <Err errors={errors.description} />
      </div>

      <ColorField value={color} onChange={setColor} error={errors.color} />

      <div>
        <label className="label" htmlFor={`pos-${category?.id ?? "new"}`}>
          Ordem
        </label>
        <input
          id={`pos-${category?.id ?? "new"}`}
          name="position"
          type="number"
          min={0}
          max={999}
          defaultValue={category?.position ?? 0}
          aria-invalid={!!errors.position}
          className="input mt-2 w-24"
        />
        <Err errors={errors.position} />
      </div>
    </div>
  );
}

export function NewCategoryForm() {
  const [state, action] = useActionState<ActionState, FormData>(saveCategoryAction.bind(null, null), { ok: false });
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form ref={ref} action={action} noValidate className="space-y-8">
      <CategoryFields category={null} state={state} onReset />
      <div className="flex flex-wrap items-center gap-5">
        <SubmitButton variant="primary" pendingLabel="Criando…">
          Criar categoria
        </SubmitButton>
        {state.message ? (
          <p role={state.ok ? "status" : "alert"} className={`font-sans text-sm ${state.ok ? "text-fg" : "text-danger"}`}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function CategoryRow({ category, count }: { category: CategorySummary; count: number }) {
  const [state, action] = useActionState<ActionState, FormData>(saveCategoryAction.bind(null, category.id), {
    ok: false,
  });

  return (
    <li className="border-t border-line py-10" style={accentVars(category.color)}>
      <div className="mb-7 flex items-baseline justify-between gap-6">
        <h3 className="flex items-center gap-3 text-2xl tracking-[-0.01em]">
          <span aria-hidden className="h-[2px] w-4 bg-(--accent)" />
          {category.name}
        </h3>
        <p className="label">
          {count} {count === 1 ? "pensamento" : "pensamentos"}
        </p>
      </div>

      <form action={action} noValidate className="space-y-8">
        <CategoryFields category={category} state={state} />
        <div className="flex flex-wrap items-center gap-5">
          <SubmitButton>Salvar</SubmitButton>
          {state.message ? (
            <p role={state.ok ? "status" : "alert"} className={`font-sans text-sm ${state.ok ? "text-fg" : "text-danger"}`}>
              {state.message}
            </p>
          ) : null}
        </div>
      </form>

      <div className="mt-8">
        <ConfirmDelete
          action={deleteCategoryAction.bind(null, category.id)}
          label="Excluir categoria"
          warning={`Excluir “${category.name}”? Os ${count} pensamento(s) associados continuam existindo, apenas sem esta categoria.`}
        />
      </div>
    </li>
  );
}
