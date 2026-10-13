import type { GeneratorEngine } from "../types/readme";
import type { TemplateId } from "../types/template";

/** Uma versão salva de README. */
export interface HistoryEntry {
  id: string;
  createdAt: number;
  title: string;
  /** `owner/repo` quando veio do GitHub. */
  repo?: string;
  template: TemplateId;
  /** Origem do texto: IA, templates ou edição/salvamento manual. */
  origin: GeneratorEngine | "manual";
  markdown: string;
}

export type NewHistoryEntry = Omit<HistoryEntry, "id" | "createdAt">;

/**
 * Contrato de persistência do histórico. A implementação atual é local (localStorage);
 * um backend com banco (ex.: tabela `readme_versions`) pode implementar a mesma interface.
 */
export interface HistoryRepository {
  list(): HistoryEntry[];
  /** Retorna a entrada salva, ou `null` quando idêntica à mais recente. */
  save(entry: NewHistoryEntry): HistoryEntry | null;
  remove(id: string): void;
  clear(): void;
}

/** Variante assíncrona do contrato, usada pela UI (o histórico remoto vive no servidor). */
export interface AsyncHistoryRepository {
  list(): Promise<HistoryEntry[]>;
  save(entry: NewHistoryEntry): Promise<HistoryEntry | null>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export function toAsync(repo: HistoryRepository): AsyncHistoryRepository {
  return {
    list: async () => repo.list(),
    save: async (entry) => repo.save(entry),
    remove: async (id) => repo.remove(id),
    clear: async () => repo.clear(),
  };
}

/**
 * Histórico na conta do usuário (Supabase, via backend). Evita gravar duplicata
 * consecutiva comparando com a versão mais recente já carregada.
 */
export function createRemoteHistory(fetchImpl: typeof fetch = (...args) => fetch(...args)): AsyncHistoryRepository {
  let latest: string | undefined;
  const call = async <T>(url: string, method = "GET", body?: unknown): Promise<T> => {
    const res = await fetchImpl(url, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) throw new Error(data?.error ?? `Erro HTTP ${res.status}`);
    return data as T;
  };

  return {
    async list() {
      const { entries } = await call<{ entries: HistoryEntry[] }>("/api/history");
      latest = entries[0]?.markdown;
      return entries;
    },
    async save(entry) {
      if (!entry.markdown.trim() || entry.markdown === latest) return null;
      const { entry: saved } = await call<{ entry: HistoryEntry }>("/api/history", "POST", entry);
      latest = saved.markdown;
      return saved;
    },
    async remove(id) {
      await call(`/api/history/${encodeURIComponent(id)}`, "DELETE");
    },
    async clear() {
      await call("/api/history", "DELETE");
      latest = undefined;
    },
  };
}

export const HISTORY_KEY = "rc:history";
export const HISTORY_MAX = 20;

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is HistoryEntry {
  const e = value as Partial<HistoryEntry> | null;
  return (
    !!e &&
    typeof e.id === "string" &&
    typeof e.createdAt === "number" &&
    typeof e.title === "string" &&
    typeof e.markdown === "string" &&
    typeof e.template === "string"
  );
}

export function createLocalHistory({
  storage = defaultStorage(),
  max = HISTORY_MAX,
  now = Date.now,
  newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
}: { storage?: Storage | null; max?: number; now?: () => number; newId?: () => string } = {}): HistoryRepository {
  // Sem storage (modo privado/bloqueado), o histórico vive só em memória.
  let memory: HistoryEntry[] = [];

  const read = (): HistoryEntry[] => {
    if (!storage) return memory;
    try {
      const parsed: unknown = JSON.parse(storage.getItem(HISTORY_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch {
      return [];
    }
  };

  const write = (entries: HistoryEntry[]) => {
    if (!storage) {
      memory = entries;
      return;
    }
    // Se a cota estourar, descarta as versões mais antigas até caber.
    for (let list = entries; list.length > 0; list = list.slice(0, -1)) {
      try {
        storage.setItem(HISTORY_KEY, JSON.stringify(list));
        return;
      } catch {
        // tenta de novo com uma entrada a menos
      }
    }
    try {
      storage.removeItem(HISTORY_KEY);
    } catch {
      // storage indisponível
    }
  };

  return {
    list: () => read().sort((a, b) => b.createdAt - a.createdAt),
    save(entry) {
      if (!entry.markdown.trim()) return null;
      const entries = read().sort((a, b) => b.createdAt - a.createdAt);
      if (entries[0]?.markdown === entry.markdown) return null;
      const saved: HistoryEntry = { ...entry, id: newId(), createdAt: now() };
      write([saved, ...entries].slice(0, max));
      return saved;
    },
    remove(id) {
      write(read().filter((e) => e.id !== id));
    },
    clear() {
      write([]);
    },
  };
}
