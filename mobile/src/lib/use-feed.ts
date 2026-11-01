import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { PostCard } from "./types";

type FeedParams = { categoria?: string; q?: string; de?: string; ate?: string };

/** Lista paginada de /api/mobile/feed: primeira página, "puxar para atualizar" e "carregar mais". */
export function useFeed(params: FeedParams, enabled = true) {
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

  const load = useCallback(
    async (target: number, mode: "initial" | "refresh" | "more") => {
      const id = ++requestId.current;
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
        setError(null);
      } catch (cause) {
        if (id === requestId.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar.");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [key],
  );

  useEffect(() => {
    if (enabled) void load(1, "initial");
  }, [load, enabled]);

  return {
    posts,
    total,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore: page < pageCount,
    refresh: () => load(1, "refresh"),
    retry: () => load(1, "initial"),
    loadMore: () => {
      if (!loadingMore && !loading && page < pageCount) void load(page + 1, "more");
    },
  };
}
