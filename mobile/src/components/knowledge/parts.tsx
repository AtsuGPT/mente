import { memo, useMemo, useState } from "react";
import { ChevronRight, Search, Sparkles, Waypoints, X, ExternalLink, Lock, PenLine } from "./icons";
import { OwnIcon, type OwnIconKind } from "./own-icons";
import {
  KIND_FILTERS,
  MASTERY_LABEL,
  childCount,
  connectionsOf,
  kindOf,
  labelOfType,
  passes,
  search,
  type GraphIndex,
  type KindFilter,
  type KnowledgeGraph,
  type KnowledgeNode,
  type StudyLink,
} from "@/lib/knowledge";

/**
 * Glifo de cada tipo com os ícones próprios (redesign de 27/11): tema = ladrilho de obsidiana com a pasta no tom dela;
 * tópico = o anel do domínio; material = o ícone do tipo (pensamento, rascunho, conversa, artefato).
 */
export function NodeGlyph({ node, size }: { node: KnowledgeNode; size?: number }) {
  if (node.type === "THEME") {
    const s = size ?? 34;
    return (
      <span className={`kg kg-theme${node.virtual ? " is-virtual" : ""}`} style={{ width: s, height: s, ["--accent" as string]: node.color }} aria-hidden>
        <OwnIcon kind={node.virtual ? "grupo" : "pastas"} size={Math.max(10, Math.round(s * 0.6))} strokeWidth={s < 20 ? 2 : 1.6} />
      </span>
    );
  }
  if (node.type === "TOPIC" || node.type === "SUBTOPIC") return <span className={`kg kg-topic m-${node.mastery ?? "estudando"}`} style={{ width: size ?? 16, height: size ?? 16 }} aria-hidden />;
  return (
    <span className="kg kg-doc" style={size ? { width: size, height: size } : undefined} aria-hidden>
      <OwnIcon kind={iconOf(node)} size={14} />
    </span>
  );
}

export function iconOf(node: KnowledgeNode): OwnIconKind {
  if (node.type === "POST") return node.draft ? "rascunho" : "pensamentos";
  if (node.type === "RESOURCE") return node.resource === "artefato" ? "artefatos" : "conversas";
  if (node.type === "THEME") return "pastas";
  if (node.type === "TOPIC" || node.type === "SUBTOPIC") return "topicos";
  return "materiais";
}

/* --------------------------------- Explorador --------------------------------- */

export const Explorer = memo(function Explorer(props: {
  graph: KnowledgeGraph;
  index: GraphIndex;
  kinds: Set<KindFilter>;
  expanded: Set<string>;
  selected: string | null;
  onToggleKind: (k: KindFilter) => void;
  onToggle: (id: string) => void;
  onSelect: (id: string, from: "explorer" | "search") => void;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => (query.trim() ? search(props.graph, query).filter((n) => passes(n, props.kinds)) : null), [query, props.graph, props.kinds]);
  return (
    <aside className="kx-panel kx-explorer" aria-label="Explorador">
      <div className="kx-head">
        <span className="kx-title">Explorador</span>
        {props.onClose ? (
          <button className="kx-icon-btn" onClick={props.onClose} aria-label="Fechar o explorador">
            <X size={16} />
          </button>
        ) : null}
      </div>
      <label className="kx-search">
        <Search size={14} aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar temas, tópicos, materiais" aria-label="Buscar no mapa" />
        {query ? (
          <button className="kx-clear" onClick={() => setQuery("")} aria-label="Limpar a busca">
            <X size={13} />
          </button>
        ) : null}
      </label>
      <div className="kx-filters" role="group" aria-label="Tipos de conteúdo">
        {KIND_FILTERS.map((f) => (
          <button key={f.id} className={`kx-chip${props.kinds.has(f.id) ? " is-on" : ""}`} aria-pressed={props.kinds.has(f.id)} onClick={() => props.onToggleKind(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="kx-scroll">
        {results ? (
          results.length ? (
            <ul className="kx-results" aria-label="Resultados da busca">
              {results.map((n) => (
                <li key={n.id}>
                  <button className={`kx-row${props.selected === n.id ? " is-selected" : ""}`} onClick={() => props.onSelect(n.id, "search")}>
                    <NodeGlyph node={n} size={n.type === "THEME" ? 16 : undefined} />
                    <span className="kx-row-label">{n.label}</span>
                    <span className="kx-row-type">{labelOfType(n)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="kx-empty">Nada com esse nome no mapa.</p>
          )
        ) : (
          <ul className="kx-tree" role="tree" aria-label="Temas">
            {props.index.themes.map((id) => (
              <TreeItem key={id} id={id} depth={0} {...props} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
});

function TreeItem(props: { id: string; depth: number; index: GraphIndex; kinds: Set<KindFilter>; expanded: Set<string>; selected: string | null; onToggle: (id: string) => void; onSelect: (id: string, from: "explorer") => void; trail?: Set<string> }) {
  const node = props.index.byId.get(props.id);
  if (!node || !passes(node, props.kinds)) return null;
  const kids = (props.index.children.get(props.id) ?? []).filter((c) => passes(props.index.byId.get(c)!, props.kinds));
  const open = props.expanded.has(props.id);
  const trail = new Set(props.trail ?? []);
  trail.add(props.id);
  const count = node.type === "THEME" ? (node.counts?.materials ?? 0) + (node.counts?.topics ?? 0) : childCount(props.index, props.id, props.kinds);
  return (
    <li role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={props.selected === props.id}>
      <div className={`kx-row${props.selected === props.id ? " is-selected" : ""}`} style={{ paddingLeft: 6 + props.depth * 14 }} ref={props.selected === props.id ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}>
        {kids.length ? (
          <button className={`kx-caret${open ? " is-open" : ""}`} onClick={() => props.onToggle(props.id)} aria-label={open ? `Recolher ${node.label}` : `Expandir ${node.label}`}>
            <ChevronRight size={13} strokeWidth={2} />
          </button>
        ) : (
          <span className="kx-caret-space" />
        )}
        <button className="kx-row-main" onClick={() => props.onSelect(props.id, "explorer")}>
          <NodeGlyph node={node} size={node.type === "THEME" ? 16 : node.type === "TOPIC" ? 10 : 18} />
          <span className="kx-row-label">{node.label}</span>
          {count ? <span className="kx-count">{count}</span> : null}
        </button>
      </div>
      {open && kids.length ? (
        <ul role="group">
          {kids.filter((k) => !trail.has(k)).map((k) => (
            <TreeItem key={k} {...props} id={k} depth={props.depth + 1} trail={trail} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/* ---------------------------------- Inspetor ---------------------------------- */

export function Inspector(props: {
  graph: KnowledgeGraph;
  index: GraphIndex;
  id: string;
  focused: boolean;
  depth: number;
  onDepth: (d: number) => void;
  onSelect: (id: string) => void;
  onOpen: (node: KnowledgeNode) => void;
  onStudy: (link: StudyLink) => void;
  onExplore: (id: string | null) => void;
  onClose: () => void;
}) {
  const node = props.index.byId.get(props.id);
  const links = useMemo(() => connectionsOf(props.graph, props.index, props.id), [props.graph, props.index, props.id]);
  if (!node) return null;
  const theme = props.index.byId.get(node.themeId);
  const groups: [string, KnowledgeNode[]][] = [
    [node.type === "THEME" ? "Contém" : "Materiais vinculados", links.contains],
    ["Está em", links.within],
    ["Conexões com outros conhecimentos", links.related],
  ];
  return (
    <aside className="kx-panel kx-inspector" aria-label="Inspetor">
      <div className="kx-head">
        <span className="kx-type">{labelOfType(node)}</span>
        <button className="kx-icon-btn" onClick={props.onClose} aria-label="Fechar o inspetor">
          <X size={16} />
        </button>
      </div>
      <div className="kx-scroll">
        <div className="ki-title">
          <NodeGlyph node={node} size={node.type === "THEME" ? 26 : node.type === "TOPIC" ? 14 : 24} />
          <h2>{node.label}</h2>
        </div>
        <p className="ki-meta">
          {node.type !== "THEME" && theme ? <span className="ki-theme" style={{ ["--accent" as string]: theme.color }}>{theme.label}</span> : null}
          {node.mastery ? <span className={`ki-mastery m-${node.mastery}`}>{MASTERY_LABEL[node.mastery]}</span> : null}
          {node.draft ? <span className="ki-flag"><PenLine size={11} /> rascunho</span> : null}
          {node.private ? <span className="ki-flag"><Lock size={11} /> privado</span> : null}
        </p>
        {node.type === "THEME" && node.counts ? (
          <div className="ki-stats">
            <div><b>{node.counts.topics}</b><span>tópicos</span></div>
            <div><b>{node.counts.materials}</b><span>materiais</span></div>
            {node.progress ? <div><b>{node.progress.dominado}</b><span>dominados</span></div> : null}
          </div>
        ) : null}
        {node.excerpt ? <p className="ki-excerpt">{node.excerpt}</p> : null}
        <div className="ki-actions">
          {node.type === "TOPIC" && theme && !theme.virtual && theme.link?.kind === "pasta" ? (
            <button className="kx-btn is-primary" onClick={() => props.onStudy({ kind: "estudo", categoryId: theme.id.slice(2), folderName: theme.label, topic: node.label })}>
              <Sparkles size={14} /> Estudar com a Kally
            </button>
          ) : null}
          {node.link ? (
            <button className="kx-btn is-primary" onClick={() => props.onOpen(node)}>
              <ExternalLink size={14} /> {openLabel(node)}
            </button>
          ) : null}
          <button className={`kx-btn${props.focused ? " is-on" : ""}`} onClick={() => props.onExplore(props.focused ? null : node.id)} aria-pressed={props.focused}>
            <Waypoints size={14} /> {props.focused ? "Ver o mapa todo" : "Explorar conexões"}
          </button>
        </div>
        {props.focused ? (
          <label className="ki-depth">
            <span>Profundidade</span>
            <input type="range" min={1} max={3} value={props.depth} onChange={(e) => props.onDepth(Number(e.target.value))} aria-label="Profundidade das conexões" />
            <b>{props.depth}</b>
          </label>
        ) : null}
        {groups.map(([title, items]) =>
          items.length ? (
            <section key={title} className="ki-group">
              <h3>{title}<span>{items.length}</span></h3>
              <ul>
                {items.slice(0, 40).map((n) => (
                  <li key={n.id}>
                    <button className="kx-row" onClick={() => props.onSelect(n.id)}>
                      <NodeGlyph node={n} size={n.type === "THEME" ? 16 : n.type === "TOPIC" ? 10 : 18} />
                      <span className="kx-row-label">{n.label}</span>
                      <span className="kx-row-type">{labelOfType(n)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}
        {!links.related.length && node.type !== "THEME" ? <p className="kx-empty">Sem conexões com outros conhecimentos ainda. Elas aparecem quando um pensamento cita outro ou a Kally usa um como fonte.</p> : null}
      </div>
    </aside>
  );
}

const openLabel = (n: KnowledgeNode) =>
  n.type === "THEME" ? "Abrir a pasta" : n.type === "POST" ? "Abrir o pensamento" : n.resource === "artefato" ? "Abrir o artefato" : n.resource === "conversa" ? "Continuar a conversa" : "Abrir";

export { kindOf };
