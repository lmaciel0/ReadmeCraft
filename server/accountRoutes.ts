import type { Context, Hono } from "hono";
import { z } from "zod";
import { GithubError, parseGithubUrl } from "../src/services/githubService";
import { TEMPLATE_IDS } from "../src/types/readme";
import { createGithubPublisher, type PublishFile } from "./githubPublisher";
import type { UserHistoryStore } from "./historyRemote";
import { createRateLimiter } from "./rateLimit";
import { isSafeSvg } from "./svgGuard";
import { clearSession, readSession, takeOAuthState, writeOAuthState, writeSession, type Session, type SessionCodec } from "./session";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  /** URL pública do app (ex.: https://readmecraft.vercel.app). Fixa o redirect_uri. */
  appUrl: string;
}

export interface AccountDeps {
  oauth: OAuthConfig;
  codec: SessionCodec;
  secureCookies: boolean;
  history?: UserHistoryStore | null;
  fetchImpl?: typeof fetch;
  publisher?: (token: string) => ReturnType<typeof createGithubPublisher>;
  /** Middleware de rate limit aplicado à publicação. */
  publishLimit: (c: Context, next: () => Promise<void>) => Promise<Response | void>;
  /** Middleware de rate limit (por IP) aplicado às rotas /api/auth/*. */
  authLimit: (c: Context, next: () => Promise<void>) => Promise<Response | void>;
}

/** Escopo mínimo para criar branch, commit e PR em repositórios públicos. */
export const OAUTH_SCOPE = "public_repo";
export const BANNER_REPO_PATH = "assets/banner.svg";

const publishSchema = z.object({
  repo: z.string().min(1).max(300),
  markdown: z.string().min(1).max(200_000),
  bannerSvg: z.string().max(100_000).refine(isSafeSvg, "SVG inválido").optional(),
});

/** Teto de versões guardadas por usuário e de gravações por minuto. */
export const MAX_HISTORY_WRITES_PER_MIN = 30;

const historySchema = z.object({
  title: z.string().min(1).max(200),
  repo: z.string().max(300).optional(),
  template: z.enum(TEMPLATE_IDS),
  origin: z.enum(["claude", "template", "manual"]),
  markdown: z.string().min(1).max(200_000),
});

export function registerAccountRoutes(app: Hono, deps: AccountDeps) {
  const { oauth, codec, secureCookies, history, fetchImpl = fetch } = deps;
  const publisherFor = deps.publisher ?? ((token: string) => createGithubPublisher(token, { fetchImpl }));
  const redirectUri = `${oauth.appUrl.replace(/\/$/, "")}/api/auth/callback`;

  const revokeToken = async (token: string) => {
    try {
      const res = await fetchImpl(`https://api.github.com/applications/${encodeURIComponent(oauth.clientId)}/token`, {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString("base64")}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "ReadmeCraft",
        },
        body: JSON.stringify({ access_token: token }),
        signal: AbortSignal.timeout(5_000),
      });
      // 204 = revogado; 404 = já inválido. Qualquer outro status só é registrado.
      if (res.status !== 204 && res.status !== 404) console.error("[auth:logout] revogação falhou:", res.status);
    } catch (err) {
      console.error("[auth:logout]", err instanceof Error ? err.message : err);
    }
  };

  const historyWriteLimiter = createRateLimiter({ limit: MAX_HISTORY_WRITES_PER_MIN, windowMs: 60_000 });

  const withSession = (handler: (c: Context, session: Session) => Promise<Response>) => async (c: Context) => {
    const session = await readSession(c, codec);
    if (!session) return c.json({ error: "Entre com o GitHub para continuar." }, 401);
    return handler(c, session);
  };

  app.get("/api/auth/me", async (c) => {
    const session = await readSession(c, codec);
    return c.json(session ? { authenticated: true, user: { login: session.login, avatar: session.avatar } } : { authenticated: false });
  });

  app.get("/api/auth/login", deps.authLimit, (c) => {
    const state = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
    writeOAuthState(c, state, secureCookies);
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({ client_id: oauth.clientId, redirect_uri: redirectUri, scope: OAUTH_SCOPE, state, allow_signup: "true" }).toString();
    return c.redirect(url.toString());
  });

  app.get("/api/auth/callback", deps.authLimit, async (c) => {
    const fail = (code: string) => c.redirect(`/?auth_error=${code}`);
    const expected = takeOAuthState(c, secureCookies);
    const { code, state, error } = c.req.query();
    if (error) return fail("denied");
    // `state` amarrado ao cookie do navegador que iniciou o login (anti-CSRF no OAuth).
    if (!code || !state || !expected || state !== expected) return fail("state");

    try {
      const tokenRes = await fetchImpl("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: oauth.clientId, client_secret: oauth.clientSecret, code, redirect_uri: redirectUri }),
        signal: AbortSignal.timeout(15_000),
      });
      const token = (await tokenRes.json()) as { access_token?: string; scope?: string };
      if (!token.access_token) return fail("token");

      const userRes = await fetchImpl("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "ReadmeCraft" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!userRes.ok) return fail("user");
      const user = (await userRes.json()) as { id: number; login: string; avatar_url: string };
      await writeSession(c, codec, { uid: user.id, login: user.login, avatar: user.avatar_url, token: token.access_token }, secureCookies);
      return c.redirect("/");
    } catch (err) {
      console.error("[auth:callback]", err instanceof Error ? err.message : err);
      return fail("network");
    }
  });

  app.post("/api/auth/logout", deps.authLimit, async (c) => {
    const session = await readSession(c, codec);
    clearSession(c, secureCookies);
    // Revoga o token no GitHub: o cookie cifrado, mesmo copiado, deixa de dar acesso a repositórios.
    if (session) await revokeToken(session.token);
    return c.json({ ok: true });
  });

  app.post(
    "/api/github/publish",
    deps.publishLimit,
    withSession(async (c, session) => {
      const parsed = publishSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "Requisição inválida." }, 400);
      const ref = parseGithubUrl(parsed.data.repo);
      if (!ref) return c.json({ error: "Repositório inválido. Use owner/repo." }, 400);

      const files: PublishFile[] = [{ path: "README.md", content: parsed.data.markdown }];
      if (parsed.data.bannerSvg && parsed.data.markdown.includes(BANNER_REPO_PATH)) {
        files.push({ path: BANNER_REPO_PATH, content: parsed.data.bannerSvg });
      }
      try {
        const result = await publisherFor(session.token).publish({ ref, files, title: "docs: atualiza o README com o ReadmeCraft" });
        return c.json(result);
      } catch (err) {
        if (err instanceof GithubError) {
          if (err.status === 401) clearSession(c, secureCookies);
          return c.json({ error: err.message }, err.status as 400);
        }
        console.error("[publish]", err instanceof Error ? err.message : err);
        return c.json({ error: "Não foi possível publicar no GitHub." }, 502);
      }
    }),
  );

  if (!history) return;

  const historyError = (c: Context, err: unknown) => {
    console.error("[history]", err instanceof Error ? err.message : err);
    return c.json({ error: "Falha ao acessar o histórico." }, 502);
  };

  app.get(
    "/api/history",
    withSession(async (c, s) => {
      try {
        return c.json({ entries: await history.list(s.uid) });
      } catch (err) {
        return historyError(c, err);
      }
    }),
  );

  app.post(
    "/api/history",
    withSession(async (c, s) => {
      const rate = historyWriteLimiter(String(s.uid));
      if (!rate.allowed) {
        c.header("Retry-After", String(rate.retryAfterSec));
        return c.json({ error: `Muitas gravações. Tente novamente em ${rate.retryAfterSec}s.` }, 429);
      }
      const parsed = historySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "Versão inválida." }, 400);
      try {
        return c.json({ entry: await history.save(s.uid, parsed.data) }, 201);
      } catch (err) {
        return historyError(c, err);
      }
    }),
  );

  app.delete(
    "/api/history/:id",
    withSession(async (c, s) => {
      const id = c.req.param("id") ?? "";
      if (!z.uuid().safeParse(id).success) return c.json({ error: "Id inválido." }, 400);
      try {
        await history.remove(s.uid, id);
        return c.json({ ok: true });
      } catch (err) {
        return historyError(c, err);
      }
    }),
  );

  app.delete(
    "/api/history",
    withSession(async (c, s) => {
      try {
        await history.clear(s.uid);
        return c.json({ ok: true });
      } catch (err) {
        return historyError(c, err);
      }
    }),
  );
}
