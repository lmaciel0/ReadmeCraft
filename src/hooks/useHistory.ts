import { useCallback, useEffect, useMemo, useState } from "react";
import { createLocalHistory, toAsync, type AsyncHistoryRepository, type HistoryEntry, type NewHistoryEntry } from "../services/historyStore";

/**
 * Estado React sobre um repositório de histórico assíncrono.
 * Sem repositório informado, usa o histórico local do navegador.
 */
export function useHistory(repository?: AsyncHistoryRepository | null) {
  const repo = useMemo(() => repository ?? toAsync(createLocalHistory()), [repository]);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEntries(await repo.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o histórico.");
    }
  }, [repo]);

  useEffect(() => {
    let alive = true;
    repo
      .list()
      .then((list) => alive && (setEntries(list), setError(null)))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : "Falha ao carregar o histórico."));
    return () => {
      alive = false;
    };
  }, [repo]);

  const run = useCallback(
    async <T,>(op: () => Promise<T>): Promise<T | null> => {
      try {
        const result = await op();
        await refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha no histórico.");
        return null;
      }
    },
    [refresh],
  );

  const save = useCallback((entry: NewHistoryEntry) => run(() => repo.save(entry)), [repo, run]);
  const remove = useCallback((id: string) => run(() => repo.remove(id)), [repo, run]);
  const clear = useCallback(() => run(() => repo.clear()), [repo, run]);

  return { entries, error, save, remove, clear };
}
