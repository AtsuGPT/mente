/**
 * Tipos de artefato e formatos. Este arquivo não depende do servidor: o app tem uma cópia das mesmas listas em
 * mobile/src/lib/artifact.ts (os dois projetos não compartilham código).
 *
 * - formato "html": uma página completa (HTML, CSS e JavaScript) que roda isolada numa caixa de areia (iframe com
 *   sandbox na web, WebView no celular), sem acesso à sessão, aos cookies, ao app nem à internet.
 * - formato "markdown": um documento, desenhado pelo próprio app (o mesmo Markdown dos pensamentos).
 */

export const ARTIFACT_KINDS = ["simulador", "grafico", "diagrama", "documento", "codigo", "ferramenta"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const ARTIFACT_FORMATS = ["html", "markdown"] as const;
export type ArtifactFormat = (typeof ARTIFACT_FORMATS)[number];

export const KIND_LABEL: Record<ArtifactKind, string> = {
  simulador: "Simulador",
  grafico: "Gráfico",
  diagrama: "Diagrama",
  documento: "Documento",
  codigo: "Código",
  ferramenta: "Ferramenta",
};

/** Sinônimos aceitos na linha "tipo:" do bloco (o modelo nem sempre usa a palavra exata). */
const KIND_ALIASES: Record<string, ArtifactKind> = {
  simulador: "simulador", simulacao: "simulador", simulação: "simulador", experimento: "simulador", laboratorio: "simulador", laboratório: "simulador",
  grafico: "grafico", gráfico: "grafico", graficos: "grafico", visualizacao: "grafico", visualização: "grafico", dashboard: "grafico", painel: "grafico", estatistica: "grafico", estatística: "grafico",
  diagrama: "diagrama", fluxograma: "diagrama", "mapa mental": "diagrama", mapa: "diagrama", arvore: "diagrama", árvore: "diagrama", grafo: "diagrama", arquitetura: "diagrama",
  documento: "documento", texto: "documento", relatorio: "documento", relatório: "documento", resumo: "documento",
  codigo: "codigo", código: "codigo", componente: "codigo", demo: "codigo", demonstracao: "codigo", demonstração: "codigo", react: "codigo", html: "codigo",
  ferramenta: "ferramenta", calculadora: "ferramenta", quiz: "ferramenta", exercicio: "ferramenta", exercício: "ferramenta", exercicios: "ferramenta", formulario: "ferramenta", formulário: "ferramenta", jogo: "ferramenta", app: "ferramenta", aplicativo: "ferramenta", conversor: "ferramenta",
};

export function kindFrom(value: string | null | undefined): ArtifactKind | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  if ((ARTIFACT_KINDS as readonly string[]).includes(v)) return v as ArtifactKind;
  if (KIND_ALIASES[v]) return KIND_ALIASES[v];
  const word = Object.keys(KIND_ALIASES).find((k) => v.includes(k));
  return word ? KIND_ALIASES[word] : null;
}

/** Bibliotecas que um artefato pode carregar (só destes endereços; o resto é bloqueado pela caixa de areia). */
export const ALLOWED_SCRIPT_HOSTS = ["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com"] as const;
export const ALLOWED_STYLE_HOSTS = [...ALLOWED_SCRIPT_HOSTS, "fonts.googleapis.com"] as const;

/** Limites (caracteres do código e dos metadados). */
export const LIMITS = { source: 200_000, title: 120, description: 400, category: 40, note: 200 } as const;
