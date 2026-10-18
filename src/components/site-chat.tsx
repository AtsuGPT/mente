"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Markdown } from "./markdown";

type Source = { title: string; slug: string; href: string };
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const suggestions = [
  "O que Kayk escreveu sobre identidade?",
  "Quais pensamentos falam sobre relações?",
  "Como o espetáculo muda nosso comportamento?",
];

export function SiteChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: "auto" });
  }, [messages, loading]);

  async function sendMessage(rawContent: string) {
    const content = rawContent.trim();
    if (!content || loading) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const history = messages.slice(-7).map(({ role, content: previousContent }) => ({ role, content: previousContent }));
    setMessages((previous) => [...previous, userMessage, assistantMessage]);
    setDraft("");
    setError("");
    setLoading(true);

    const updateAssistant = (update: (message: ChatMessage) => ChatMessage) => {
      setMessages((previous) => previous.map((message) => message.id === assistantMessage.id ? update(message) : message));
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content }] }),
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
        const event = JSON.parse(data) as { text?: string; error?: string; sources?: Source[] };
        if (event.error) throw new Error(event.error);
        if (event.text) updateAssistant((message) => ({ ...message, content: message.content + event.text }));
        if (event.sources) updateAssistant((message) => ({ ...message, sources: event.sources }));
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
      updateAssistant((current) => ({ ...current, content: message, sources: [] }));
    } finally {
      setLoading(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  return (
    <section className="site-chat" aria-label="Conversa com o assistente">
      <div className="site-chat-toolbar">
        <div>
          <p className="label">Arquivo de pensamentos · Ollama</p>
          <p className="mt-1 text-xs text-muted">As respostas sobre Kayk se apoiam nos textos publicados.</p>
        </div>
        {messages.length ? (
          <button
            type="button"
            className="site-chat-reset"
            disabled={loading}
            onClick={() => { setMessages([]); setError(""); }}
          >
            Nova conversa
          </button>
        ) : null}
      </div>

      <div ref={threadRef} className="site-chat-thread" aria-live="polite" aria-relevant="additions text">
        {!messages.length ? (
          <div className="site-chat-empty">
            <p className="font-serif text-xl">O que você quer descobrir?</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">Pergunte sobre um tema, uma ideia ou o que Kayk já escreveu.</p>
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
            <p className="site-chat-speaker">{message.role === "user" ? "Você" : "Assistente"}</p>
            {message.content ? <Markdown>{message.content}</Markdown> : loading ? <p className="text-sm text-muted">Lendo os pensamentos…</p> : null}
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
      </div>

      {error ? <p role="alert" className="site-chat-error">{error}</p> : null}
      <form className="site-chat-composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="site-chat-input">Sua pergunta</label>
        <textarea
          id="site-chat-input"
          value={draft}
          maxLength={1200}
          rows={1}
          placeholder="Escreva sua pergunta…"
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
        <button type="submit" aria-label={loading ? "Aguarde a resposta" : "Enviar pergunta"} title={loading ? "Gerando resposta" : "Enviar pergunta"} disabled={loading || !draft.trim()}>
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