import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EnvApi } from "./api";
import type { PostCard } from "./types";

type FeedParams = { categoria?: string; q?: string; de?: string; ate?: string };

/**
 * Lista paginada do feed do ambiente: primeira página, "puxar para atualizar" e "carregar mais".
 *
 * refresh/retry/loadMore são estáveis (mesma função entre renderizações). Antes eles eram
 * recriados a cada render; a tela inicial os usava como dependência de useFocusEffect, o
 * efeito rodava de novo a cada render e chamava refresh(), que gerava outro render — um
 * laço infinito que mantinha o RefreshControl abrindo e fechando (o "scroll infinito").
 */
export function useFeed(api: EnvApi, params: FeedParams, enabled = true) {
  const [posts, setPosts] = useState<PostCard[]>([]);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params);
  const requestId = useRef(0);
  // Estado lido pelos callbacks estáveis sem entrar nas dependências deles.
  const paging = useRef({ page: 0, pageCount: 1, busy: false });

  const load = useCallback(
    async (target: number, mode: "initial" | "refresh" | "more") => {
      const id = ++requestId.current;
      paging.current.busy = true;
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      if (mode === "more") setLoadingMore(true);
      try {
        const result = await api.feed({ ...(JSON.parse(key) as FeedParams), pagina: target });
        if (id !== requestId.current) return; // resposta de uma busca anterior
        setPosts((current) => (target === 1 ? result.posts : [...current, ...result.posts.filter((p) => !current.some((c) => c.id === p.id))]));
        setPage(result.page);
        setPageCount(result.pageCount);
        setTotal(result.total);
        paging.current.page = result.page;
        paging.current.pageCount = result.pageCount;
        setError(null);
      } catch (cause) {
        if (id === requestId.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar.");
      } finally {
        if (id === requestId.current) {
          paging.current.busy = false;
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [api, key],
  );

  useEffect(() => {
    if (enabled) void load(1, "initial");
  }, [load, enabled]);

  const refresh = useCallback(() => load(1, "refresh"), [load]);
  const retry = useCallback(() => load(1, "initial"), [load]);
  const loadMore = useCallback(() => {
    const { page: current, pageCount: last, busy } = paging.current;
    if (!busy && current < last) void load(current + 1, "more");
  }, [load]);

  return useMemo(
    () => ({ posts, total, loading, refreshing, loadingMore, error, hasMore: page < pageCount, refresh, retry, loadMore }),
    [posts, total, loading, refreshing, loadingMore, error, page, pageCount, refresh, retry, loadMore],
  );
}
