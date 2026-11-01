"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { publishChatDraftAction, type ChatPublishResult } from "@/app/admin/actions";
import { Markdown } from "@/components/markdown";
import {
  APPROACHES,
  APPROACH_LABELS,
  AUTONOMY_LABELS,
  DEPTHS,
  DEPTH_LABELS,
  TEACHING_LABELS,
  TEACHING_STEPS,
  type PostAction,
  type PostDraft,
  type PostPlan,
  type PostWorkspace,
} from "@/lib/kally/types";

type Category = { id: string; name: string };

type Props = {
  workspace: PostWorkspace;
  categories: Category[];
  loading: boolean;
  progress: string;
  previousDraft: PostDraft | null;
  onUpdate: (workspace: PostWorkspace) => void;
  onAction: (action: PostAction, options?: { message?: string; display?: string; workspace?: PostWorkspace }) => void;
  onUndo: () => void;
  onClose: () => void;
};

const STAGE_LABEL: Record<PostWorkspace["stage"], string> = {
  briefing: "Entendendo a ideia",
  plan: "Plano para aprovar",
  writing: "Escrevendo",
  draft: "Rascunho pronto",
  teaching: "Construção guiada",
};

function words(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

/* ------------------------------------------------------------------ */

function PlanEditor({ workspace, categories, loading, onUpdate, onAction }: Pick<Props, "workspace" | "categories" | "loading" | "onUpdate" | "onAction">) {
  const plan = workspace.plan as PostPlan;
  const update = (patch: Partial<PostPlan>) => onUpdate({ ...workspace, plan: { ...plan, ...patch } });
  const updateSection = (index: number, patch: Partial<PostPlan["estrutura"][number]>) =>
    update({ estrutura: plan.estrutura.map((section, current) => current === index ? { ...section, ...patch } : section) });

  return (
    <div className="kally-plan">
      <p className="kally-panel-hint">Ajuste o que quiser — enfoque, abordagem, profundidade, estrutura e extensão — ou peça mudanças no chat. A Kally só escreve depois da sua aprovação.</p>
      <label className="kally-field">
        <span>Título sugerido</span>
        <input value={plan.tituloSugerido} maxLength={200} onChange={(event) => update({ tituloSugerido: event.target.value })} />
      </label>
      <label className="kally-field">
        <span>Objetivo</span>
        <textarea rows={2} value={plan.objetivo} onChange={(event) => update({ objetivo: event.target.value })} />
      </label>
      <label className="kally-field">
        <span>Ideia central (tese)</span>
        <textarea rows={2} value={plan.tese} onChange={(event) => update({ tese: event.target.value })} />
      </label>
      <label className="kally-field">
        <span>Público e finalidade</span>
        <input value={plan.publico} onChange={(event) => update({ publico: event.target.value })} />
      </label>
      <fieldset className="kally-field">
        <legend>Abordagem</legend>
        <div className="kally-chips">
          {APPROACHES.map((approach) => (
            <button key={approach} type="button" aria-pressed={plan.abordagem === approach} onClick={() => update({ abordagem: approach })}>
              {APPROACH_LABELS[approach]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="kally-field">
        <legend>Profundidade</legend>
        <div className="kally-chips">
          {DEPTHS.map((depth) => (
            <button key={depth} type="button" aria-pressed={plan.profundidade === depth} title={DEPTH_LABELS[depth].hint} onClick={() => update({ profundidade: depth })}>
              {DEPTH_LABELS[depth].label}
            </button>
          ))}
        </div>
        <p className="kally-panel-hint">{DEPTH_LABELS[plan.profundidade].hint}. Temas amplos são escritos em partes.</p>
      </fieldset>
      <fieldset className="kally-field">
        <legend>Estrutura ({plan.estrutura.length} {plan.estrutura.length === 1 ? "parte" : "partes"})</legend>
        <ol className="kally-sections">
          {plan.estrutura.map((section, index) => (
            <li key={index}>
              <input aria-label={`Título da parte ${index + 1}`} value={section.titulo} onChange={(event) => updateSection(index, { titulo: event.target.value })} />
              <textarea aria-label={`Ideias da parte ${index + 1}`} rows={2} value={section.ideias} onChange={(event) => updateSection(index, { ideias: event.target.value })} />
              <div className="kally-section-actions">
                <button type="button" disabled={index === 0} onClick={() => {
                  const next = [...plan.estrutura];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  update({ estrutura: next });
                }}>Subir</button>
                <button type="button" disabled={plan.estrutura.length <= 2} onClick={() => update({ estrutura: plan.estrutura.filter((_, current) => current !== index) })}>Remover</button>
              </div>
            </li>
          ))}
        </ol>
        {plan.estrutura.length < 10 ? (
          <button type="button" className="kally-link-button" onClick={() => update({ estrutura: [...plan.estrutura, { titulo: "Nova parte", ideias: "" }] })}>
            + Adicionar parte
          </button>
        ) : null}
      </fieldset>
      <label className="kally-field">
        <span>Ideias que não podem ficar de fora</span>
        <textarea rows={2} value={plan.essenciais} onChange={(event) => update({ essenciais: event.target.value })} />
      </label>
      <label className="kally-field">
        <span>Categoria</span>
        <select value={plan.categoriaSugerida} onChange={(event) => update({ categoriaSugerida: event.target.value })}>
          <option value="">Sem categoria</option>
          {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
        </select>
      </label>
      <div className="kally-actions">
        <button type="button" className="kally-primary" disabled={loading || plan.estrutura.length < 1} onClick={() => onAction("approve_plan", { display: "Plano aprovado. Pode escrever." })}>
          Aprovar plano e escrever
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TeachingPanel({ workspace, loading, onUpdate, onAction }: Pick<Props, "workspace" | "loading" | "onUpdate" | "onAction">) {
  const step = workspace.teachingStep;
  const index = TEACHING_STEPS.indexOf(step);
  const value = workspace.parts[step] ?? "";
  const isLast = index === TEACHING_STEPS.length - 1;

  const goTo = (target: number, announce: boolean) => {
    const nextStep = TEACHING_STEPS[target];
    const next = { ...workspace, teachingStep: nextStep };
    onUpdate(next);
    if (announce) onAction("teach_next", { workspace: next, display: `Vamos para: ${TEACHING_LABELS[nextStep]}.` });
  };

  const assemble = () => {
    const body = (["introducao", "desenvolvimento", "aprofundamento", "conclusao"] as const)
      .map((part) => workspace.parts[part]?.trim())
      .filter(Boolean)
      .join("\n\n");
    onUpdate({
      ...workspace,
      stage: "draft",
      draft: {
        title: workspace.draft?.title || workspace.plan?.tituloSugerido || "",
        category: workspace.draft?.category || workspace.plan?.categoriaSugerida || "",
        content: body,
      },
    });
  };

  return (
    <div className="kally-teaching">
      <ol className="kally-steps" aria-label="Etapas da construção">
        {TEACHING_STEPS.map((item, position) => (
          <li key={item}>
            <button
              type="button"
              aria-current={item === step ? "step" : undefined}
              className={workspace.parts[item]?.trim() ? "is-done" : ""}
              disabled={loading}
              onClick={() => goTo(position, item !== step)}
            >
              <span>{position + 1}</span> {TEACHING_LABELS[item]}
            </button>
          </li>
        ))}
      </ol>
      <label className="kally-field">
        <span>Sua versão — {TEACHING_LABELS[step]}</span>
        <textarea
          rows={step === "tese" ? 3 : 7}
          value={value}
          placeholder={step === "tese" ? "Em uma ou duas frases: qual é a ideia central do texto?" : "Escreva aqui com as suas palavras. A Kally comenta, pergunta e sugere caminhos — mas quem escreve é você."}
          onChange={(event) => onUpdate({ ...workspace, parts: { ...workspace.parts, [step]: event.target.value } })}
        />
      </label>
      <div className="kally-actions">
        <button type="button" disabled={loading || !value.trim()} onClick={() => onAction("teach_feedback", { message: value, display: `Minha versão (${TEACHING_LABELS[step]}):\n\n${value}` })}>
          Pedir retorno da Kally
        </button>
        {!isLast ? (
          <button type="button" className="kally-primary" disabled={loading} onClick={() => goTo(index + 1, true)}>
            Guardar e avançar
          </button>
        ) : (
          <button type="button" className="kally-primary" disabled={loading || !TEACHING_STEPS.slice(1).some((item) => workspace.parts[item]?.trim())} onClick={assemble}>
            Montar rascunho com minhas partes
          </button>
        )}
      </div>
      <p className="kally-panel-hint">A ideia central orienta o texto e não entra no rascunho; introdução, desenvolvimento, aprofundamento e conclusão são unidos na ordem, exatamente como você escreveu.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DraftPanel({ workspace, categories, loading, previousDraft, onUpdate, onAction, onUndo }: Pick<Props, "workspace" | "categories" | "loading" | "previousDraft" | "onUpdate" | "onAction" | "onUndo">) {
  const draft = workspace.draft as PostDraft;
  const [view, setView] = useState<"preview" | "edit">("preview");
  const [confirming, setConfirming] = useState<"publish" | "save" | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [result, setResult] = useState<ChatPublishResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const writing = workspace.stage === "writing";
  const update = (patch: Partial<PostDraft>) => onUpdate({ ...workspace, draft: { ...draft, ...patch } });
  const category = categories.find((item) => item.name === draft.category);

  const submit = (intent: "publish" | "save") => {
    startTransition(async () => {
      const response = await publishChatDraftAction({
        title: draft.title,
        content: draft.content,
        categoryIds: category ? [category.id] : [],
        private: isPrivate,
        intent,
      });
      setResult(response);
      if (response.ok) setConfirming(null);
    });
  };

  if (result?.ok && result.id) {
    return (
      <div className="kally-published" role="status">
        <p className="font-sans text-sm font-semibold">{result.status === "publish" ? "Publicado no Minha Mente." : "Rascunho salvo no painel."}</p>
        <p className="mt-1 text-sm text-muted">“{draft.title}”{category ? ` · ${category.name}` : ""}{isPrivate ? " · privado" : ""}</p>
        <div className="kally-actions">
          {result.status === "publish" && result.slug ? <Link className="kally-primary" href={`/pensamento/${result.slug}`}>Ver pensamento</Link> : null}
          <Link href={`/admin/pensamentos/${result.id}`}>Abrir no editor</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="kally-draft">
      <label className="kally-field">
        <span>Título</span>
        <input value={draft.title} maxLength={200} disabled={writing} onChange={(event) => update({ title: event.target.value })} />
      </label>
      <label className="kally-field">
        <span>Categoria</span>
        <select value={category ? category.name : ""} disabled={writing} onChange={(event) => update({ category: event.target.value })}>
          <option value="">Sem categoria</option>
          {categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
        </select>
      </label>

      <div className="kally-draft-toolbar">
        <div className="kally-chips" role="tablist" aria-label="Modo de visualização">
          <button type="button" role="tab" aria-selected={view === "preview"} aria-pressed={view === "preview"} onClick={() => setView("preview")}>Prévia</button>
          <button type="button" role="tab" aria-selected={view === "edit"} aria-pressed={view === "edit"} disabled={writing} onClick={() => setView("edit")}>Editar texto</button>
        </div>
        <span className="text-xs text-faint">{words(draft.content).toLocaleString("pt-BR")} palavras</span>
      </div>

      {view === "edit" && !writing ? (
        <textarea className="kally-draft-editor" value={draft.content} onChange={(event) => update({ content: event.target.value })} aria-label="Conteúdo do post em Markdown" />
      ) : (
        <div className="kally-draft-preview">
          {draft.content ? <Markdown>{draft.content}</Markdown> : <p className="text-sm text-muted">O texto aparece aqui enquanto é escrito…</p>}
        </div>
      )}

      {!writing && workspace.plan ? (
        <div className="kally-field">
          <span className="kally-field-label">Reescrever com outra profundidade</span>
          <div className="kally-chips">
            {DEPTHS.map((depth) => (
              <button
                key={depth}
                type="button"
                aria-pressed={workspace.plan?.profundidade === depth}
                title={DEPTH_LABELS[depth].hint}
                disabled={loading}
                onClick={() => {
                  if (workspace.plan?.profundidade === depth) return;
                  const next = { ...workspace, plan: { ...workspace.plan!, profundidade: depth } };
                  onAction("write", { workspace: next, display: `Reescreva o post com profundidade ${DEPTH_LABELS[depth].label.toLowerCase()}.` });
                }}
              >
                {DEPTH_LABELS[depth].label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!writing ? (
        <div className="kally-actions">
          {previousDraft ? <button type="button" disabled={loading} onClick={onUndo}>Desfazer última alteração</button> : null}
          <button type="button" onClick={() => {
            void navigator.clipboard?.writeText(`# ${draft.title}\n\n${draft.content}`).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}>{copied ? "Copiado" : "Copiar"}</button>
          <button type="button" disabled={loading || pending || !draft.title.trim()} onClick={() => setConfirming("save")}>Salvar como rascunho</button>
          <button type="button" className="kally-primary" disabled={loading || pending || !draft.title.trim() || !draft.content.trim()} onClick={() => setConfirming("publish")}>Publicar…</button>
        </div>
      ) : null}

      {confirming ? (
        <div className="kally-confirm" role="alertdialog" aria-label="Confirmar publicação">
          <p className="font-sans text-sm">
            {confirming === "publish" ? "Publicar agora" : "Salvar como rascunho"} <strong>“{draft.title}”</strong>
            {category ? <> em <strong>{category.name}</strong></> : " sem categoria"}?
            {confirming === "publish" ? " Ele ficará visível no site imediatamente." : " Ele não aparece no site até ser publicado pelo painel."}
          </p>
          <label className="kally-check">
            <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
            Privado (visível só para quem entra com senha e para o administrador)
          </label>
          {result && !result.ok ? (
            <p role="alert" className="text-sm text-danger">
              {result.message}{result.fieldErrors ? ` ${Object.values(result.fieldErrors).flat().filter(Boolean).join(" ")}` : ""}
            </p>
          ) : null}
          <div className="kally-actions">
            <button type="button" className="kally-primary" disabled={pending} onClick={() => submit(confirming)}>
              {pending ? "Enviando…" : confirming === "publish" ? "Confirmar publicação" : "Confirmar"}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirming(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PostWorkspacePanel(props: Props) {
  const { workspace, loading, progress, onAction, onClose } = props;
  const [collapsed, setCollapsed] = useState(false);
  const { autonomy, stage } = workspace;
  const hasDraft = Boolean(workspace.draft);

  // Atalhos ao trocar de nível: o trabalho feito até aqui é mantido.
  const shortcuts: { label: string; action: PostAction; display: string }[] = [];
  if (!loading && stage !== "writing") {
    if (autonomy === "auto" && !hasDraft && stage !== "draft" && stage !== "teaching") shortcuts.push({ label: "Escrever o post agora", action: "write", display: "Pode escrever o post." });
    if (autonomy === "consultivo" && stage !== "plan" && stage !== "draft") shortcuts.push({ label: "Montar o plano", action: "plan", display: "Monte o plano do post." });
    if (autonomy === "educativo" && stage !== "teaching") shortcuts.push({ label: hasDraft ? "Revisar o rascunho comigo, parte por parte" : "Começar a construção guiada", action: "teach_start", display: "Quero construir o texto com você, parte por parte." });
    if (autonomy !== "educativo" && stage === "teaching") shortcuts.push({ label: "Kally completa o texto a partir das minhas partes", action: "write", display: "Complete o texto a partir das minhas partes." });
  }

  return (
    <section className="kally-workspace" aria-label="Criação de post">
      <header className="kally-workspace-header">
        <div>
          <p className="label">Criação de post · {AUTONOMY_LABELS[autonomy].label}</p>
          <p className="mt-1 font-sans text-sm font-semibold">{STAGE_LABEL[stage]}{loading && progress ? <span className="text-muted font-normal"> — {progress}</span> : null}</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="kally-link-button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
            {collapsed ? "Mostrar" : "Recolher"}
          </button>
          <button type="button" className="kally-link-button" disabled={loading} onClick={onClose}>Encerrar</button>
        </div>
      </header>
      {!collapsed ? (
        <div className="kally-workspace-body">
          {shortcuts.length ? (
            <div className="kally-actions">
              {shortcuts.map((shortcut) => (
                <button key={shortcut.action} type="button" onClick={() => {
                  const next = shortcut.action === "teach_start" ? { ...workspace, stage: "teaching" as const } : workspace;
                  onAction(shortcut.action, { display: shortcut.display, workspace: next });
                }}>
                  {shortcut.label}
                </button>
              ))}
            </div>
          ) : null}
          {stage === "plan" && workspace.plan ? <PlanEditor {...props} /> : null}
          {stage === "teaching" ? <TeachingPanel {...props} /> : null}
          {(stage === "draft" || stage === "writing") && workspace.draft ? <DraftPanel {...props} /> : null}
          {stage === "briefing" ? (
            <p className="kally-panel-hint">
              {autonomy === "consultivo"
                ? "Responda no chat. A Kally pergunta só o que falta, aos poucos, e depois mostra o plano para você aprovar."
                : "Responda no chat para a Kally continuar."}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
