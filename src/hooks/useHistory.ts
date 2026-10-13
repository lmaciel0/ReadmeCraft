import { useCallback, useMemo, useState } from "react";
import { createLocalHistory, type HistoryEntry, type HistoryRepository, type NewHistoryEntry } from "../services/historyStore";

/** Estado React sobre um HistoryRepository (local por padrão). */
export function useHistory(repository?: HistoryRepository) {
  const repo = useMemo(() => repository ?? createLocalHistory(), [repository]);
  const [entries, setEntries] = useState<HistoryEntry[]>(() => repo.list());

  const save = useCallback(
    (entry: NewHistoryEntry) => {
      const saved = repo.save(entry);
      if (saved) setEntries(repo.list());
      return saved;
    },
    [repo],
  );
  const remove = useCallback(
    (id: string) => {
      repo.remove(id);
      setEntries(repo.list());
    },
    [repo],
  );
  const clear = useCallback(() => {
    repo.clear();
    setEntries([]);
  }, [repo]);

  return { entries, save, remove, clear };
}
