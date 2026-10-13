import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { streamText } from "hono/streaming";
import { z } from "zod";
import { GithubError, fetchRepoMetadata, parseGithubUrl } from "../src/services/githubService";
import { buildReadme } from "../src/services/readmeBuilder";
import type { RepoMetadata, RepoRef } from "../src/types/github";
import type { GeneratorEngine, GeneratorOptions, HealthStatus } from "../src/types/readme";
import { generateRequestSchema } from "../src/types/schemas";
import { registerAccountRoutes, type AccountDeps } from "./accountRoutes";
import { createRateLimiter, createTtlCache } from "./rateLimit";

/** Marcador anexado ao stream quando um erro ocorre depois do início da resposta. */
export const STREAM_ERROR_MARKER = "<!-- rc:error=";

export type ReadmeStreamer = (meta: RepoMetadata, options: GeneratorOptions, signal: AbortSignal) => AsyncIterable<string>;

export interface AppDeps {
  fetchRepo?: (ref: RepoRef) => Promise<RepoMetadata>;
  /** Stream do Claude; quando ausente, usa o gerador por templates. */
  aiStreamer?: ReadmeStreamer | null;
  model?: string | null;
  rateLimits?: { analyzePerMin: number; generatePerMin: number; generatePerDay: number };
  /** Atraso entre blocos no modo template (efeito de streaming). */
  templateChunkDelayMs?: number;
  getClientIp?: (c: Context) => string;
  /** Login com GitHub, publicação via PR e histórico remoto (opcionais). */
  account?: Omit<AccountDeps, "publishLimit" | "authLimit"> | null;
}

const analyzeSchema = z.object({ url: z.string().min(1).max(300) });

export function createApp({
  fetchRepo = (ref) => fetchRepoMetadata(ref),
  aiStreamer = null,
  model = null,
  rateLimits = { analyzePerMin: 10, generatePerMin: 10, generatePerDay: 500 },
  templateChunkDelayMs = 15,
  getClientIp = () => "local",
  account = null,
}: AppDeps = {}) {
  const app = new Hono();
  const analyzeLimiter = createRateLimiter({ limit: rateLimits.analyzePerMin, windowMs: 60_000 });
  const generateLimiter = createRateLimiter({ limit: rateLimits.generatePerMin, windowMs: 60_000 });
  // Orçamento global diário: limita o custo total mesmo com muitos IPs distintos.
  const dailyBudget = createRateLimiter({ limit: rateLimits.generatePerDay, windowMs: 24 * 60 * 60_000 });
  const repoCache = createTtlCache<RepoMetadata>({ ttlMs: 10 * 60_000 });

  const limit = (limiter: ReturnType<typeof createRateLimiter>) => async (c: Context, next: () => Promise<void>) => {
    const result = limiter(getClientIp(c));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSec));
      return c.json({ error: `Muitas requisições. Tente novamente em ${result.retryAfterSec}s.` }, 429);
    }
    await next();
  };

  // Registrado antes das rotas: vale também para as respostas da API.
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // 'unsafe-inline' em estilos: Mermaid e o CSS do preview injetam <style>.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        // READMEs referenciam imagens externas (badges, screenshots).
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
    }),
  );
  app.use("/api/*", bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: "Payload muito grande." }, 413) }));
  app.use("/api/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });
  // Bloqueia POSTs cross-site "simples" (text/plain, no-cors) que usariam a API como proxy gratuito do Claude.
  // Bloqueia requisições cross-site que mudam estado: POST "simples" (text/plain, no-cors)
  // usaria a API como proxy gratuito do Claude; com sessão, também evita CSRF.
  app.on(["POST", "PUT", "PATCH", "DELETE"], "/api/*", async (c, next) => {
    if (c.req.method === "POST" && !c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
      return c.json({ error: "Content-Type deve ser application/json." }, 415);
    }
    const site = c.req.header("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      return c.json({ error: "Origem não permitida." }, 403);
    }
    const origin = c.req.header("origin");
    if (origin) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        // Origin malformado
      }
      const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
      if (!originHost || originHost !== host) return c.json({ error: "Origem não permitida." }, 403);
    }
    await next();
  });

  app.get("/api/health", (c) =>
    // Não expõe se há GITHUB_TOKEN configurado (só o necessário para a UI).
    c.json<HealthStatus>({
      ok: true,
      ai: Boolean(aiStreamer),
      model: aiStreamer ? model : null,
      features: { login: Boolean(account), history: Boolean(account?.history) },
    }),
  );

  if (account) {
    const publishLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
    const authLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
    registerAccountRoutes(app, { ...account, publishLimit: limit(publishLimiter), authLimit: limit(authLimiter) });
  }

  app.post("/api/repo/analyze", limit(analyzeLimiter), async (c) => {
    const parsed = analyzeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Informe a URL do repositório." }, 400);
    const ref = parseGithubUrl(parsed.data.url);
    if (!ref) return c.json({ error: "URL inválida. Use https://github.com/<owner>/<repo>." }, 400);

    const key = `${ref.owner}/${ref.repo}`.toLowerCase();
    const cached = repoCache.get(key);
    if (cached) return c.json({ metadata: cached, cached: true });
    try {
      const metadata = await fetchRepo(ref);
      repoCache.set(key, metadata);
      return c.json({ metadata, cached: false });
    } catch (err) {
      if (err instanceof GithubError) return c.json({ error: err.message }, err.status as 400);
      console.error("[analyze]", err);
      return c.json({ error: "Não foi possível analisar o repositório." }, 502);
    }
  });

  app.post("/api/generate", limit(generateLimiter), async (c) => {
    const parsed = generateRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Requisição inválida.", issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")) }, 400);
    }
    // Só requisições válidas gastam o orçamento: corpo inválido não pode esgotá-lo para todos.
    if (!dailyBudget("global").allowed) return c.json({ error: "Limite diário de gerações do servidor atingido." }, 429);
    const { metadata, options } = parsed.data as { metadata: RepoMetadata; options: GeneratorOptions };
    const signal = c.req.raw.signal;

    const engine: GeneratorEngine = aiStreamer ? "claude" : "template";
    const source = aiStreamer ? aiStreamer(metadata, options, signal) : templateStream(metadata, options, templateChunkDelayMs, signal);
    const iterator = source[Symbol.asyncIterator]();

    // Aguarda o primeiro bloco para poder responder com status HTTP de erro adequado.
    let first: IteratorResult<string>;
    try {
      first = await iterator.next();
    } catch (err) {
      console.error("[generate]", err);
      return c.json({ error: publicErrorMessage(err) }, 502);
    }

    c.header("X-Generator-Engine", engine);
    c.header("X-Content-Type-Options", "nosniff");
    return streamText(c, async (stream) => {
      try {
        if (!first.done) await stream.write(first.value);
        for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
          if (stream.aborted) break;
          await stream.write(next.value);
        }
      } catch (err) {
        if (!signal.aborted) {
          console.error("[generate:stream]", err);
          await stream.write(`\n\n${STREAM_ERROR_MARKER}${encodeURIComponent(publicErrorMessage(err))} -->`);
        }
      }
    });
  });

  return app;
}

async function* templateStream(meta: RepoMetadata, options: GeneratorOptions, delayMs: number, signal: AbortSignal) {
  const markdown = buildReadme(meta, options);
  // Entrega em blocos de linhas para o preview "digitar" como no modo IA.
  const lines = markdown.split(/(?<=\n)/);
  for (let i = 0; i < lines.length; i += 3) {
    if (signal.aborted) return;
    yield lines.slice(i, i + 3).join("");
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
}

/** Mensagens seguras para o cliente — sem stack traces nem detalhes de credenciais. */
export function publicErrorMessage(err: unknown): string {
  if (err instanceof Error && err.name === "GenerationRefusedError") return err.message;
  const status = (err as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return "Credenciais da Anthropic inválidas no servidor.";
  if (status === 429) return "Limite da API da Anthropic atingido. Tente novamente em instantes.";
  if (status === 529 || (status !== undefined && status >= 500)) return "A API da Anthropic está indisponível no momento.";
  return "Falha ao gerar o README.";
}
