import { createClient } from "@supabase/supabase-js";
import type { HistoryEntry, NewHistoryEntry } from "../src/services/historyStore";

/** Persistência do histórico por usuário do GitHub (implementada com Supabase no servidor). */
export interface UserHistoryStore {
  list(userId: number): Promise<HistoryEntry[]>;
  save(userId: number, entry: NewHistoryEntry): Promise<HistoryEntry>;
  remove(userId: number, id: string): Promise<void>;
  clear(userId: number): Promise<void>;
}

interface Row {
  id: string;
  title: string;
  repo: string | null;
  template: HistoryEntry["template"];
  origin: HistoryEntry["origin"];
  markdown: string;
  created_at: string;
}

const COLUMNS = "id, title, repo, template, origin, markdown, created_at";

const toEntry = (r: Row): HistoryEntry => ({
  id: r.id,
  title: r.title,
  repo: r.repo ?? undefined,
  template: r.template,
  origin: r.origin,
  markdown: r.markdown,
  createdAt: Date.parse(r.created_at),
});

/**
 * Usa a chave secreta do Supabase (ignora RLS), por isso roda só no servidor.
 * Toda consulta filtra por `github_user_id` da sessão — o cliente nunca escolhe o usuário.
 */
export function createSupabaseHistory(url: string, secretKey: string): UserHistoryStore {
  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const table = () => db.from("readme_versions");
  const fail = (op: string, error: { message: string } | null) => {
    if (error) throw new Error(`Supabase (${op}): ${error.message}`);
  };

  return {
    async list(userId) {
      const { data, error } = await table().select(COLUMNS).eq("github_user_id", userId).order("created_at", { ascending: false }).limit(50);
      fail("list", error);
      return (data as Row[]).map(toEntry);
    },
    async save(userId, entry) {
      const { data, error } = await table()
        .insert({ github_user_id: userId, title: entry.title, repo: entry.repo ?? null, template: entry.template, origin: entry.origin, markdown: entry.markdown })
        .select(COLUMNS)
        .single();
      fail("save", error);
      return toEntry(data as Row);
    },
    async remove(userId, id) {
      const { error } = await table().delete().eq("github_user_id", userId).eq("id", id);
      fail("remove", error);
    },
    async clear(userId) {
      const { error } = await table().delete().eq("github_user_id", userId);
      fail("clear", error);
    },
  };
}
