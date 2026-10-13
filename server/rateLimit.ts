/**
 * Rate limiter em memória por janela fixa. Suficiente para uma instância única;
 * em produção distribuída, troque por Redis ou pelo firewall da plataforma.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 50_000,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  /** Teto de chaves em memória: acima dele, novas chaves são recusadas (fail closed). */
  maxKeys?: number;
  now?: () => number;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function check(key: string): RateLimitResult {
    const t = now();
    let entry = hits.get(key);
    if (!entry && hits.size >= maxKeys) {
      for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      if (hits.size >= maxKeys) return { allowed: false, remaining: 0, retryAfterSec: Math.ceil(windowMs / 1000) };
    }
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    return {
      allowed: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
      retryAfterSec: Math.ceil((entry.resetAt - t) / 1000),
    };
  };
}

/** Cache TTL simples com limite de entradas (evicção da mais antiga). */
export function createTtlCache<T>({ ttlMs, maxEntries = 200, now = Date.now }: { ttlMs: number; maxEntries?: number; now?: () => number }) {
  const store = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= now()) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T) {
      if (store.size >= maxEntries) store.delete(store.keys().next().value!);
      store.set(key, { value, expiresAt: now() + ttlMs });
    },
  };
}

/** IPv6 é agrupado por /64: um único cliente controla o prefixo inteiro. */
export function rateLimitKey(ip: string): string {
  if (!ip.includes(":") || ip.startsWith("::ffff:")) return ip.replace(/^::ffff:/, "");
  const [head = ""] = ip.split("::");
  const groups = head.split(":").filter(Boolean);
  return `${groups.slice(0, 4).join(":")}::/64`;
}
