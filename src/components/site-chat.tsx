"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Markdown } from "./markdown";
import { ACCEPTED_FILES, AttachmentTray, statusLabel, statusTone, type PendingAttachment } from "./kally/attachment-tray";
import { PostWorkspacePanel } from "./kally/post-workspace";
import {
  AUTONOMY_LABELS,
  AUTONOMY_LEVELS,
  emptyWorkspace,
  type AttachmentInfo,
  type AttachmentStatus,
  type Autonomy,
  type PostAction,
  type PostDraft,
  type PostWorkspace,
  type WebSource,
} from "@/lib/kally/types";

type Source = { title: string; slug: string; href: string };
type AttachmentSource = { ref: string; name: string; status: AttachmentStatus; detail: string };
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  webSources?: WebSource[];
  attachmentSources?: AttachmentSource[];
  attachments?: AttachmentInfo[];
  choices?: { label: string; message: string }[];
  confirmPost?: string;
  /** Avisos locais (troca de nível etc.) não são enviados ao servidor. */
  local?: boolean;
};

type Role = "ADMIN" | "INTIMO" | "CONVIDADO";
type Category = { id: string; name: string };

const suggestions = [
  "O que Kayk escreveu sobre identidade?",
  "Quais pensamentos falam sobre relações?",
  "Como o espetáculo muda nosso comportamento?",
];

const WORKSPACE_KEY = "minha-mente:kally:workspace:v1";
const AUTONOMY_KEY = "minha-mente:kally:autonomy:v1";
const MAX_PENDING = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const SOURCE_KIND_LABEL: Record<WebSource["kind"], string> = {
  web: "Site",
  academico: "Acadêmico",
  livro: "Livro",
  referencia: "Referência",
  noticia: "Notícia",
};

/** Modo Desenvolvedor: personalidade definida pela pessoa (só com conta), guardada neste navegador. */
type DevConfig = { active: boolean; persona: string; instructions: string; vulgar: boolean };
const DEV_KEY = "minha-mente.kally-dev.v1";
const DEV_OFF: DevConfig = { active: false, persona: "livre", instructions: "", vulgar: false };
const DEV_PERSONAS: [string, string][] = [["livre", "Só minhas instruções"], ["direta", "Direta"], ["divertida", "Divertida"], ["deferente", "Deferente / obediente"], ["formal", "Formal"]];

export function SiteChat({ role = "CONVIDADO", categories = [] }: { role?: Role; categories?: Category[] }) {
  const isAdmin = role === "ADMIN";
  const canDev = role === "ADMIN";
  const canAttach = role === "ADMIN" || role === "INTIMO";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [autonomy, setAutonomy] = useState<Autonomy>("auto");
  const [workspace, setWorkspace] = useState<PostWorkspace | null>(null);
  const [previousDraft, setPreviousDraft] = useState<PostDraft | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [conversationFiles, setConversationFiles] = useState<AttachmentInfo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dev, setDevState] = useState<DevConfig>(DEV_OFF);
  const [devOpen, setDevOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<PostWorkspace | null>(null);
  workspaceRef.current = workspace;

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: "auto" });
  }, [messages, loading]);

  // Preferências e trabalho em andamento ficam só neste navegador.
  useEffect(() => {
    if (!isAdmin) return;
    try {
      const savedAutonomy = localStorage.getItem(AUTONOMY_KEY);
      if (AUTONOMY_LEVELS.includes(savedAutonomy as Autonomy)) setAutonomy(savedAutonomy as Autonomy);
      const savedWorkspace = localStorage.getItem(WORKSPACE_KEY);
      if (savedWorkspace) {
        const parsed = JSON.parse(savedWorkspace) as PostWorkspace;
        setWorkspace({ ...parsed, stage: parsed.stage === "writing" ? (parsed.draft ? "draft" : "briefing") : parsed.stage });
      }
    } catch {
      // O chat funciona sem armazenamento local.
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      try {
        if (workspace) localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
        else localStorage.removeItem(WORKSPACE_KEY);
      } catch {
        // Cota cheia ou navegação privada: o trabalho continua em memória.
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [workspace, isAdmin]);

  useEffect(() => {
    if (!canDev) return;
    try {
      const saved = localStorage.getItem(DEV_KEY);
      if (saved) setDevState({ ...DEV_OFF, ...(JSON.parse(saved) as Partial<DevConfig>) });
    } catch {
      // Sem armazenamento local: o modo vale só nesta aba.
    }
  }, [canDev]);

  function setDev(next: DevConfig, message?: string) {
    setDevState(next);
    try {
      localStorage.setItem(DEV_KEY, JSON.stringify(next));
    } catch {
      // ignorado
    }
    if (message) setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: "assistant", local: true, content: message }]);
  }

  /** /dev, /dev on, /dev off (ou "padrão"), /dev <instruções>. Tratado aqui; nada vai ao modelo. */
  function devCommand(content: string) {
    setDraft("");
    if (!canDev) {
      setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: "assistant", local: true, content: "O modo desenvolvedor está disponível só para o administrador." }]);
      return;
    }
    const arg = content.replace(/^\/dev\s*/i, "").trim();
    if (/^(off|desligar|padr[aã]o|sair)$/i.test(arg)) return setDev({ ...dev, active: false }, "Modo desenvolvedor **desligado**. Voltei à Kally padrão.");
    if (!arg || /^(on|ligar)$/i.test(arg)) {
      const active = arg ? true : !dev.active;
      if (active) setDevOpen(true);
      return setDev({ ...dev, active }, active ? "Modo desenvolvedor **ligado**. Ajuste a personalidade no painel ou com `/dev suas instruções`." : "Modo desenvolvedor **desligado**. Voltei à Kally padrão.");
    }
    setDev({ ...dev, active: true, instructions: arg.slice(0, 2000) }, "Modo desenvolvedor **ligado** com as suas instruções. Use `/dev off` para voltar à Kally padrão.");
  }

  function chooseAutonomy(next: Autonomy) {
    setAutonomy(next);
    try {
      localStorage.setItem(AUTONOMY_KEY, next);
    } catch {
      // ignorado
    }
    if (workspace && workspace.autonomy !== next) {
      setWorkspace({ ...workspace, autonomy: next });
      setMessages((previous) => [...previous, {
        id: crypto.randomUUID(),
        role: "assistant",
        local: true,
        content: `Modo alterado para **${AUTONOMY_LABELS[next].label}**, sem perder o que já foi feito. ${AUTONOMY_LABELS[next].hint}`,
      }]);
    }
  }

  /* ------------------------------ Anexos ------------------------------ */

  async function uploadFile(file: File, localId: string) {
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/chat/attachments", { method: "POST", body: form });
      const result = await response.json() as { attachment?: AttachmentInfo; error?: string };
      if (!response.ok || !result.attachment) throw new Error(result.error || "Não foi possível processar o arquivo.");
      setPending((previous) => previous.map((item) => item.localId === localId ? { ...item, state: "done", info: result.attachment } : item));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Falha no envio.";
      setPending((previous) => previous.map((item) => item.localId === localId ? { ...item, state: "error", error: message } : item));
    }
  }

  function addFiles(files: FileList | File[]) {
    const list = [...files];
    const room = MAX_PENDING - pending.length;
    if (room <= 0) {
      setError(`Você pode anexar até ${MAX_PENDING} arquivos por mensagem.`);
      return;
    }
    if (list.length > room) setError(`Só ${room} arquivo(s) foram adicionados: o limite é ${MAX_PENDING} por mensagem.`);
    for (const file of list.slice(0, room)) {
      const localId = crypto.randomUUID();
      if (file.size > MAX_FILE_BYTES) {
        setPending((previous) => [...previous, { localId, name: file.name, size: file.size, state: "error", error: "Arquivo acima de 25 MB." }]);
        continue;
      }
      setPending((previous) => [...previous, { localId, name: file.name, size: file.size, state: "uploading" }]);
      void uploadFile(file, localId);
    }
  }

  function removePending(localId: string) {
    const item = pending.find((entry) => entry.localId === localId);
    setPending((previous) => previous.filter((entry) => entry.localId !== localId));
    if (item?.info) void fetch(`/api/chat/attachments?id=${encodeURIComponent(item.info.id)}`, { method: "DELETE" }).catch(() => {});
  }

  /* ------------------------------ Envio ------------------------------ */

  type SendOptions = {
    action?: PostAction;
    workspace?: PostWorkspace | null;
    display?: string;
    skipPostIntent?: boolean;
  };

  async function sendMessage(rawContent: string, options: SendOptions = {}) {
    const readyFiles = pending.filter((item) => item.state === "done" && item.info).map((item) => item.info as AttachmentInfo);
    const content = rawContent.trim() || (readyFiles.length && !options.action ? "Analise os anexos enviados." : "");
    if (!content || loading) return;
    if (!options.action && /^\/dev(?:\s|$)/i.test(content)) return devCommand(content);
    if (pending.some((item) => item.state === "uploading")) {
      setError("Aguarde o processamento dos anexos antes de enviar.");
      return;
    }

    let activeWorkspace = options.workspace === undefined ? workspaceRef.current : options.workspace;
    // "/post" com uma criação em andamento começa um novo post.
    if (activeWorkspace && !options.action && /^\/post(?:\s|$)/i.test(content)) {
      if (activeWorkspace.draft?.content && !window.confirm("Começar um novo post? O rascunho atual que não foi publicado nem salvo será descartado.")) return;
      activeWorkspace = null;
      setWorkspace(null);
      setPreviousDraft(null);
    }
    let action: PostAction | undefined = options.action;
    if (activeWorkspace && !action) action = "message";
    if (activeWorkspace && action === "message") {
      activeWorkspace = { ...activeWorkspace, notes: [...activeWorkspace.notes, content].slice(-24) };
      setWorkspace(activeWorkspace);
    }
    if (activeWorkspace && options.workspace) setWorkspace(activeWorkspace);

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: options.display ?? content, attachments: readyFiles.length ? readyFiles : undefined };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const history = messages
      .filter((message) => !message.local && message.content.trim())
      .slice(-7)
      .map(({ role: messageRole, content: previousContent }) => ({ role: messageRole, content: messageRole === "assistant" ? previousContent.slice(0, 4_000) : previousContent }));
    const fileIds = [...conversationFiles, ...readyFiles].map((file) => file.id);

    setMessages((previous) => [...previous, userMessage, assistantMessage]);
    setDraft("");
    setError("");
    setProgress("");
    setLoading(true);
    if (readyFiles.length) {
      setConversationFiles((previous) => [...previous, ...readyFiles]);
      setPending([]);
    }

    const updateAssistant = (update: (message: ChatMessage) => ChatMessage) => {
      setMessages((previous) => previous.map((message) => message.id === assistantMessage.id ? update(message) : message));
    };
    let savedPrevious = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, { role: "user", content }],
          attachments: fileIds,
          webSearch,
          autonomy,
          skipPostIntent: options.skipPostIntent,
          ...(canDev && dev.active ? { dev: { active: true, persona: dev.persona, instructions: dev.instructions, vulgar: dev.vulgar } } : {}),
          ...(activeWorkspace && action ? { post: { action, workspace: activeWorkspace } } : {}),
        }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "Não foi possível enviar sua pergunta.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Este navegador não conseguiu receber a resposta em tempo real.");

      const decoder = new TextDecoder();
      let buffer = "";
      const handleFrame = (frame: string) => {
        const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        if (!data) return;
        const event = JSON.parse(data) as {
          text?: string;
          error?: string;
          sources?: Source[];
          webSources?: WebSource[];
          attachmentSources?: AttachmentSource[];
          attachmentsExpired?: string[];
          progress?: string;
          choices?: { label: string; message: string }[];
          intent?: { kind: string; idea: string };
          post?: { start?: PostWorkspace } & Partial<PostWorkspace>;
          draftReset?: PostDraft;
          draftText?: string;
          draftDone?: PostDraft;
        };
        if (event.error) throw new Error(event.error);
        if (event.text) updateAssistant((message) => ({ ...message, content: message.content + event.text }));
        if (event.sources) updateAssistant((message) => ({ ...message, sources: event.sources }));
        if (event.webSources) updateAssistant((message) => ({ ...message, webSources: event.webSources }));
        if (event.attachmentSources) updateAssistant((message) => ({ ...message, attachmentSources: event.attachmentSources }));
        if (event.choices) updateAssistant((message) => ({ ...message, choices: event.choices }));
        if (event.intent?.kind === "confirm_post") {
          const idea = event.intent.idea;
          updateAssistant((message) => ({ ...message, confirmPost: idea }));
        }
        if (event.progress) setProgress(event.progress);
        if (event.attachmentsExpired) {
          const expired = new Set(event.attachmentsExpired);
          setConversationFiles((previous) => previous.filter((file) => !expired.has(file.id)));
        }
        if (event.post) {
          const { start, ...patch } = event.post;
          if (start) setWorkspace(start);
          else setWorkspace((current) => current ? { ...current, ...patch } : current);
        }
        if (event.draftReset) {
          const reset = event.draftReset;
          const before = workspaceRef.current?.draft;
          if (before?.content && !savedPrevious) {
            savedPrevious = true;
            setPreviousDraft(before);
          }
          setWorkspace((current) => current ? { ...current, draft: reset } : current);
        }
        if (event.draftText) {
          const chunk = event.draftText;
          setWorkspace((current) => current?.draft ? { ...current, draft: { ...current.draft, content: current.draft.content + chunk } } : current);
        }
        if (event.draftDone) {
          const done = event.draftDone;
          setWorkspace((current) => current ? { ...current, draft: done } : current);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) handleFrame(frame);
        if (done) break;
      }
      if (buffer.trim()) handleFrame(buffer);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Falha ao conversar com o assistente.";
      setError(message);
      updateAssistant((current) => ({ ...current, content: current.content ? `${current.content}\n\n*${message}*` : message }));
      // Uma escrita interrompida volta para a etapa anterior, sem perder o rascunho parcial.
      setWorkspace((current) => current && current.stage === "writing" ? { ...current, stage: current.draft ? "draft" : "briefing" } : current);
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  function runPostAction(action: PostAction, options: { message?: string; display?: string; workspace?: PostWorkspace } = {}) {
    void sendMessage(options.message ?? options.display ?? action, { action, workspace: options.workspace ?? workspaceRef.current, display: options.display });
  }

  function startPostFrom(idea: string) {
    const next = emptyWorkspace(autonomy, idea);
    setWorkspace(next);
    setPreviousDraft(null);
    void sendMessage(idea, { action: "start", workspace: next, display: "Sim, quero transformar isso em um post." });
  }

  function closeWorkspace() {
    if (workspace?.draft?.content && !window.confirm("Encerrar a criação? O rascunho que não foi publicado nem salvo será descartado.")) return;
    setWorkspace(null);
    setPreviousDraft(null);
  }

  function resetConversation() {
    if (workspace?.draft?.content && !window.confirm("Começar uma nova conversa descarta também o rascunho em criação. Continuar?")) return;
    for (const file of conversationFiles) void fetch(`/api/chat/attachments?id=${encodeURIComponent(file.id)}`, { method: "DELETE" }).catch(() => {});
    setMessages([]);
    setError("");
    setWorkspace(null);
    setPreviousDraft(null);
    setConversationFiles([]);
    setPending([]);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  const uploading = pending.some((item) => item.state === "uploading");
  const lastAssistantId = [...messages].reverse().find((message) => message.role === "assistant")?.id;
  const placeholder = workspace
    ? workspace.stage === "draft" ? "Peça alterações no rascunho…" : workspace.stage === "teaching" ? "Pergunte ou comente sobre esta etapa…" : "Responda à Kally…"
    : isAdmin ? "Escreva sua pergunta… (/post cria uma publicação)" : "Escreva sua pergunta…";

  return (
    <section
      className={`site-chat${dragging ? " is-dragging" : ""}`}
      aria-label="Conversa com a Kally"
      onDragOver={canAttach ? (event) => { event.preventDefault(); setDragging(true); } : undefined}
      onDragLeave={canAttach ? () => setDragging(false) : undefined}
      onDrop={canAttach ? (event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
      } : undefined}
    >
      <div className="site-chat-toolbar">
        <div>
          <p className="label">{dev.active && canDev ? "Kally · Modo desenvolvedor" : "Kally · Arquivo de pensamentos · Ollama"}</p>
          <p className="mt-1 text-xs text-muted">As respostas sobre Kayk se apoiam nos textos publicados.</p>
        </div>
        <div className="flex flex-none items-center gap-3">
          <button
            type="button"
            className="kally-toggle"
            aria-pressed={webSearch}
            title="Pesquisar na internet geral (buscadores, artigos acadêmicos e referências) nas próximas mensagens"
            onClick={() => setWebSearch((value) => !value)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5S9.6 5.8 12 3.5Z" stroke="currentColor" strokeWidth="1.6" /></svg>
            Internet
          </button>
          {canDev ? (
            <button type="button" className="kally-toggle" aria-pressed={dev.active} title="Modo desenvolvedor: personalidade e estilo definidos por você (/dev)" onClick={() => setDevOpen((value) => !value)}>
              Dev
            </button>
          ) : null}
          {messages.length || workspace ? (
            <button type="button" className="site-chat-reset" disabled={loading} onClick={resetConversation}>
              Nova conversa
            </button>
          ) : null}
        </div>
      </div>

      {canDev && devOpen ? (
        <div className="kally-autonomy" aria-label="Modo desenvolvedor">
          <span className="label">Modo desenvolvedor {dev.active ? "· ativo" : "· desligado"}</span>
          <div className="kally-segmented" role="radiogroup" aria-label="Personalidade">
            {DEV_PERSONAS.map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={dev.persona === id} onClick={() => setDev({ ...dev, persona: id })}>{label}</button>
            ))}
          </div>
          <textarea
            className="w-full border border-line bg-transparent p-2 text-sm"
            rows={3}
            maxLength={2000}
            value={dev.instructions}
            placeholder="Instruções de personalidade (têm prioridade sobre o estilo padrão)…"
            onChange={(event) => setDev({ ...dev, instructions: event.target.value })}
          />
          <label className="kally-autonomy-hint">
            <input type="checkbox" checked={dev.vulgar} onChange={(event) => setDev({ ...dev, vulgar: event.target.checked })} /> Linguagem vulgar liberada
          </label>
          <div className="flex gap-3">
            <button type="button" className="kally-toggle" aria-pressed={dev.active} onClick={() => { setDev({ ...dev, active: true }, "Modo desenvolvedor **ligado**."); setDevOpen(false); }}>Ativar</button>
            <button type="button" className="site-chat-reset" onClick={() => { setDev({ ...dev, active: false }, "Modo desenvolvedor **desligado**. Voltei à Kally padrão."); setDevOpen(false); }}>Voltar à Kally padrão</button>
          </div>
          <span className="kally-autonomy-hint">Muda só a personalidade e o estilo. Permissões, privacidade e a criação de posts continuam iguais.</span>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="kally-autonomy" role="radiogroup" aria-label="Nível de autonomia na criação de posts">
          <span className="label">Criação de posts</span>
          <div className="kally-segmented">
            {AUTONOMY_LEVELS.map((level) => (
              <button key={level} type="button" role="radio" aria-checked={autonomy === level} disabled={loading} title={AUTONOMY_LABELS[level].hint} onClick={() => chooseAutonomy(level)}>
                {AUTONOMY_LABELS[level].label}
              </button>
            ))}
          </div>
          <span className="kally-autonomy-hint">{AUTONOMY_LABELS[autonomy].hint}</span>
        </div>
      ) : null}

      <div ref={threadRef} className="site-chat-thread" aria-live="polite" aria-relevant="additions text">
        {!messages.length && !workspace ? (
          <div className="site-chat-empty">
            <p className="font-serif text-xl">O que você quer descobrir?</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              Pergunte sobre um tema, uma ideia ou o que Kayk já escreveu.
              {canAttach ? " Você pode anexar vários arquivos de uma vez." : ""}
              {isAdmin ? " Use /post para transformar uma ideia em publicação." : ""}
            </p>
            <div className="site-chat-suggestions" aria-label="Perguntas sugeridas">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" disabled={loading} onClick={() => void sendMessage(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((message) => (
          <article key={message.id} className={`site-chat-message ${message.role === "user" ? "is-user" : "is-assistant"}`}>
            <p className="site-chat-speaker">{message.role === "user" ? "Você" : message.local ? "Minha Mente" : dev.active && canDev ? "Kally · dev" : "Kally"}</p>
            {message.content ? <Markdown>{message.content}</Markdown> : loading && message.id === lastAssistantId ? <p className="text-sm text-muted">{progress || "Lendo os pensamentos…"}</p> : null}
            {loading && message.id === lastAssistantId && message.content && progress ? <p className="kally-progress">{progress}</p> : null}
            {message.attachments?.length ? (
              <div className="kally-message-files" aria-label="Arquivos anexados">
                {message.attachments.map((file) => (
                  <span key={file.id} className={`kally-file-chip ${statusTone(file.status)}`} title={file.detail}>{file.name} · {statusLabel(file.status)}</span>
                ))}
              </div>
            ) : null}
            {message.choices?.length && message.id === lastAssistantId && !loading ? (
              <div className="kally-chips mt-3">
                {message.choices.map((choice) => (
                  <button key={choice.label} type="button" onClick={() => void sendMessage(choice.message)}>{choice.label}</button>
                ))}
              </div>
            ) : null}
            {message.confirmPost && message.id === lastAssistantId && !loading ? (
              <div className="kally-actions">
                <button type="button" className="kally-primary" onClick={() => startPostFrom(message.confirmPost as string)}>Sim, criar um post</button>
                <button type="button" onClick={() => void sendMessage(message.confirmPost as string, { skipPostIntent: true, display: "Não, só quero conversar sobre isso." })}>Não, só conversar</button>
              </div>
            ) : null}
            {message.attachmentSources?.length ? (
              <div className="site-chat-sources" aria-label="Anexos consultados">
                <span className="label">Anexos consultados</span>
                {message.attachmentSources.map((source) => (
                  <span key={source.ref} className={`kally-file-chip ${statusTone(source.status)}`} title={source.detail}>[{source.ref}] {source.name} · {statusLabel(source.status)}</span>
                ))}
              </div>
            ) : null}
            {message.webSources?.length ? (
              <div className="site-chat-sources kally-web-sources" aria-label="Fontes da internet">
                <span className="label">Fontes da internet</span>
                {message.webSources.map((source) => (
                  <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" title={source.read ? "Conteúdo lido" : "Somente resumo do buscador"}>
                    <span className="kally-source-id">[{source.id}]</span> {source.title}
                    <span className="kally-source-meta"> — {source.site} · {SOURCE_KIND_LABEL[source.kind]}{source.read ? "" : " · só resumo"}</span>
                  </a>
                ))}
              </div>
            ) : null}
            {message.sources?.length ? (
              <div className="site-chat-sources" aria-label="Pensamentos consultados">
                <span className="label">Pensamentos relacionados</span>
                {message.sources.map((source) => (
                  <Link key={source.slug} href={source.href}>{source.title}</Link>
                ))}
              </div>
            ) : null}
          </article>
        ))}

        {workspace && isAdmin ? (
          <PostWorkspacePanel
            workspace={workspace}
            categories={categories}
            loading={loading}
            progress={progress}
            previousDraft={previousDraft}
            onUpdate={setWorkspace}
            onAction={runPostAction}
            onUndo={() => {
              if (!previousDraft) return;
              setWorkspace({ ...workspace, draft: previousDraft, stage: "draft" });
              setPreviousDraft(null);
            }}
            onClose={closeWorkspace}
          />
        ) : null}
      </div>

      {error ? <p role="alert" className="site-chat-error">{error}</p> : null}
      {canAttach ? <AttachmentTray items={pending} onRemove={removePending} disabled={loading} /> : null}
      {conversationFiles.length && !pending.length ? (
        <p className="kally-context-files">{conversationFiles.length} anexo(s) em uso nesta conversa: {conversationFiles.map((file) => file.name).join(", ")}</p>
      ) : null}
      <form className={`site-chat-composer${canAttach ? " has-attach" : ""}`} onSubmit={submit}>
        {canAttach ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                if (event.target.files?.length) addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button type="button" className="kally-attach-button" aria-label="Anexar arquivos" title="Anexar arquivos (PDF, TXT, MD, DOCX, CSV, imagens e áudio)" disabled={loading} onClick={() => fileInputRef.current?.click()}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </>
        ) : null}
        <label className="sr-only" htmlFor="site-chat-input">Sua pergunta</label>
        <textarea
          id="site-chat-input"
          value={draft}
          maxLength={isAdmin ? 30_000 : canAttach ? 6_000 : 1_200}
          rows={1}
          placeholder={placeholder}
          enterKeyHint="send"
          disabled={loading}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage(draft);
            }
          }}
        />
        <button
          type="submit"
          aria-label={loading ? "Aguarde a resposta" : "Enviar pergunta"}
          title={loading ? "Gerando resposta" : uploading ? "Aguarde o processamento dos anexos" : "Enviar pergunta"}
          disabled={loading || uploading || (!draft.trim() && !pending.some((item) => item.state === "done"))}
        >
          {loading ? (
            <span className="site-chat-spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 19V5m0 0L6.5 10.5M12 5l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </form>
    </section>
  );
}
