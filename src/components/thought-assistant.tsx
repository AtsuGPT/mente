"use client";

import { useEffect, useState } from "react";
import { accentVars } from "@/lib/color";
import { Markdown } from "./markdown";

const actions = [
  { mode: "summarize", label: "Resumir" },
  { mode: "clarify", label: "Esclarecer" },
  { mode: "deepen", label: "Aprofundar" },
] as const;

type Mode = (typeof actions)[number]["mode"];
type Insight = { mode: Mode; label: string; text: string };

export function ThoughtAssistant({ slug, revision, accentColor }: { slug: string; revision: string; accentColor?: string }) {
  const cachePrefix = `minha-mente:gemini:v1:${encodeURIComponent(slug)}:${encodeURIComponent(revision)}`;
  const [selected, setSelected] = useState<Mode | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [cached, setCached] = useState<Partial<Record<Mode, string>>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const saved: Partial<Record<Mode, string>> = {};
    for (const action of actions) {
      try {
        const value = localStorage.getItem(`${cachePrefix}:${action.mode}`);
        if (value) saved[action.mode] = value;
      } catch {
        // The assistant still works when browser storage is unavailable.
      }
    }
    setCached(saved);
  }, [cachePrefix]);

  async function requestInsight(mode: Mode) {
    setSelected(mode);
    setError("");

    const savedText = cached[mode];
    if (savedText) {
      setInsight({ mode, label: actions.find((action) => action.mode === mode)?.label ?? "Leitura", text: savedText });
      return;
    }

    setInsight(null);
    setLoading(true);
    setConnecting(true);

    try {
      const response = await fetch(`/api/thoughts/${encodeURIComponent(slug)}/insight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "Não foi possível gerar a leitura.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Este navegador não conseguiu receber a leitura em tempo real.");

      const decoder = new TextDecoder();
      let buffer = "";
      let generatedText = "";
      const label = actions.find((action) => action.mode === mode)?.label ?? "Leitura";

      const handleFrame = (frame: string) => {
        const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        if (!data) return;
        const event = JSON.parse(data) as { text?: string; error?: string; done?: boolean };
        if (event.error) throw new Error(event.error);
        if ("status" in event) setConnecting(false);
        if (event.text) {
          setConnecting(false);
          generatedText += event.text;
          setInsight({ mode, label, text: generatedText });
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
      if (!generatedText.trim()) throw new Error("O Gemini não retornou uma leitura desta vez.");

      setCached((previous) => ({ ...previous, [mode]: generatedText }));
      try {
        localStorage.setItem(`${cachePrefix}:${mode}`, generatedText);
      } catch {
        // Storage quotas/private browsing should not hide the generated answer.
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao conectar com o assistente.");
    } finally {
      setConnecting(false);
      setLoading(false);
    }
  }

  return (
    <section className="thought-assistant" style={accentVars(accentColor)} aria-labelledby="assistant-title">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="label text-(--accent-text)">Leitura assistida · Gemini</p>
          <h2 id="assistant-title" className="mt-1 font-sans text-sm font-semibold text-fg">Explore este pensamento</h2>
        </div>
        <span aria-hidden="true" className="mt-1 size-2 rounded-full bg-(--accent) shadow-[0_0_14px_var(--accent)]" />
      </div>

      <div className="thought-assistant-actions" aria-label="Ações de leitura com IA">
        {actions.map((action) => (
          <button
            key={action.mode}
            type="button"
            className="thought-assistant-button"
            style={selected === action.mode ? accentVars(accentColor) : undefined}
            aria-pressed={selected === action.mode}
            disabled={loading}
            onClick={() => requestInsight(action.mode)}
          >
            {loading && selected === action.mode ? "Lendo…" : action.label}
          </button>
        ))}
      </div>

      {error ? <p role="alert" className="mt-4 font-sans text-sm leading-relaxed text-muted">{error}</p> : null}
      {loading ? <p role="status" className="mt-4 font-sans text-sm text-muted">{connecting ? "Conectando ao Gemini…" : "Lendo o pensamento…"}</p> : null}
      {insight ? (
        <div className="thought-assistant-result" aria-live="polite">
          <p className="label mb-3 text-(--accent-text)">{insight.label} · {loading ? "gerando" : "salvo neste navegador"}</p>
          <Markdown>{insight.text}</Markdown>
          <p className="mt-4 font-sans text-xs leading-relaxed text-faint">Esta leitura é complementar e não altera o pensamento publicado.</p>
        </div>
      ) : null}
    </section>
  );
}