import { setDefaultResultOrder } from "node:dns";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context } from "hono";
import { fetchRepoMetadata } from "../src/services/githubService";
import { createApp } from "./app";
import { rateLimitKey } from "./rateLimit";
import { DEFAULT_MODEL, hasAnthropicCredentials, streamReadmeWithClaude } from "./claude";

try {
  process.loadEnvFile();
} catch {
  // Sem .env: segue com as variáveis do ambiente.
}

// Redes com IPv6 quebrado fazem o fetch do Node expirar antes de tentar IPv4.
setDefaultResultOrder("ipv4first");

const port = Number(process.env.PORT ?? 8787);
const isProd = process.env.NODE_ENV === "production";
const githubToken = process.env.GITHUB_TOKEN?.trim() || undefined;
const generatePerDay = Number(process.env.GENERATE_DAILY_LIMIT ?? 500);
const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
const aiEnabled = hasAnthropicCredentials();

function clientIp(c: Context): string {
  if (process.env.TRUST_PROXY === "1") {
    // Proxies acrescentam à DIREITA; a entrada mais à esquerda é controlada pelo cliente.
    const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (forwarded) return rateLimitKey(forwarded);
  }
  try {
    return rateLimitKey(getConnInfo(c).remote.address ?? "unknown");
  } catch {
    return "unknown";
  }
}

const api = createApp({
  fetchRepo: (ref) => fetchRepoMetadata(ref, { token: githubToken }),
  aiStreamer: aiEnabled ? (meta, options, signal) => streamReadmeWithClaude(meta, options, { model, signal }) : null,
  model,
  rateLimits: { analyzePerMin: 10, generatePerMin: 10, generatePerDay },
  getClientIp: clientIp,
});

if (isProd) {
  api.use("/*", serveStatic({ root: "./dist" }));
  api.get("*", serveStatic({ path: "./dist/index.html" }));
}

serve({ fetch: api.fetch, port }, (info) => {
  console.log(`ReadmeCraft API em http://localhost:${info.port}`);
  console.log(aiEnabled ? `  IA: Claude (${model})` : "  IA: desativada — usando gerador por templates (defina ANTHROPIC_API_KEY)");
  console.log(githubToken ? "  GitHub: autenticado" : "  GitHub: anônimo (60 req/h)");
});
