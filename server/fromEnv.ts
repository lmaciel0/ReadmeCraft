import type { Context } from "hono";
import { fetchRepoMetadata } from "../src/services/githubService";
import type { AppDeps } from "./app";
import { createApp } from "./app";
import { DEFAULT_MODEL, hasAnthropicCredentials, streamReadmeWithClaude } from "./claude";
import { createSupabaseHistory } from "./historyRemote";
import { rateLimitKey } from "./rateLimit";
import { createSessionCodec } from "./session";

export interface EnvOptions {
  env?: NodeJS.ProcessEnv;
  /** Extrai o IP do cliente da conexão (Node) quando não há proxy confiável. */
  connectionIp?: (c: Context) => string | undefined;
  log?: (message: string) => void;
}

const clean = (v: string | undefined) => v?.trim() || undefined;

/** IP do cliente para rate limit, conforme o proxy em frente ao app. */
export function clientIpResolver(trustProxy: string | undefined, connectionIp?: (c: Context) => string | undefined) {
  return (c: Context): string => {
    if (trustProxy === "vercel") {
      // A Vercel sobrescreve estes cabeçalhos com o IP real; o cliente não consegue forjá-los.
      const ip = c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
      if (ip) return rateLimitKey(ip);
    } else if (trustProxy === "1") {
      // Proxies acrescentam à DIREITA; a entrada mais à esquerda é controlada pelo cliente.
      const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
      if (forwarded) return rateLimitKey(forwarded);
    }
    const ip = connectionIp?.(c);
    return ip ? rateLimitKey(ip) : "unknown";
  };
}

/**
 * Monta o app a partir das variáveis de ambiente. Cada recurso só liga
 * quando a configuração dele está completa (IA, OAuth do GitHub, Supabase).
 */
export function createAppFromEnv({ env = process.env, connectionIp, log = console.log }: EnvOptions = {}) {
  const githubToken = clean(env.GITHUB_TOKEN);
  const model = clean(env.ANTHROPIC_MODEL) ?? DEFAULT_MODEL;
  const aiEnabled = hasAnthropicCredentials(env);
  const generatePerDay = Number(env.GENERATE_DAILY_LIMIT ?? 500);
  const isProd = env.NODE_ENV === "production" || Boolean(env.VERCEL);

  let account: AppDeps["account"] = null;
  const clientId = clean(env.GITHUB_CLIENT_ID);
  const clientSecret = clean(env.GITHUB_CLIENT_SECRET);
  const sessionSecret = clean(env.SESSION_SECRET);
  const appUrl = clean(env.APP_URL);
  if (clientId && clientSecret && sessionSecret && appUrl) {
    const supabaseUrl = clean(env.SUPABASE_URL);
    const supabaseKey = clean(env.SUPABASE_SECRET_KEY);
    account = {
      oauth: { clientId, clientSecret, appUrl },
      codec: createSessionCodec(sessionSecret),
      secureCookies: appUrl.startsWith("https://"),
      history: supabaseUrl && supabaseKey ? createSupabaseHistory(supabaseUrl, supabaseKey) : null,
    };
  }

  log(aiEnabled ? `  IA: Claude (${model})` : "  IA: desativada — gerador por templates (defina ANTHROPIC_API_KEY)");
  log(githubToken ? "  GitHub (leitura): autenticado" : "  GitHub (leitura): anônimo (60 req/h)");
  log(account ? `  Login GitHub: ativo${account.history ? " + histórico no Supabase" : ""}` : "  Login GitHub: desativado (defina GITHUB_CLIENT_ID/SECRET, SESSION_SECRET e APP_URL)");

  return {
    isProd,
    app: createApp({
      fetchRepo: (ref) => fetchRepoMetadata(ref, { token: githubToken }),
      aiStreamer: aiEnabled ? (meta, options, signal) => streamReadmeWithClaude(meta, options, { model, signal }) : null,
      model,
      rateLimits: { analyzePerMin: 10, generatePerMin: 10, generatePerDay },
      getClientIp: clientIpResolver(clean(env.TRUST_PROXY), connectionIp),
      account,
    }),
  };
}
