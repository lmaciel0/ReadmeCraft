// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createApp, type AppDeps } from "../../server/app";
import { clientIpResolver } from "../../server/fromEnv";
import { createGithubPublisher } from "../../server/githubPublisher";
import type { UserHistoryStore } from "../../server/historyRemote";
import { SESSION_COOKIE, STATE_COOKIE, createSessionCodec } from "../../server/session";
import type { HistoryEntry } from "../../src/services/historyStore";

const SECRET = "x".repeat(40);
const codec = createSessionCodec(SECRET);
const oauth = { clientId: "cid", clientSecret: "csecret", appUrl: "https://rc.example.com" };
const json = (body: unknown, extra: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...extra },
  body: JSON.stringify(body),
});

function memoryHistory(): UserHistoryStore & { rows: (HistoryEntry & { uid: number })[] } {
  const rows: (HistoryEntry & { uid: number })[] = [];
  let n = 0;
  return {
    rows,
    list: async (uid) => rows.filter((r) => r.uid === uid).sort((a, b) => b.createdAt - a.createdAt),
    save: async (uid, e) => {
      const row = { ...e, uid, id: `00000000-0000-4000-8000-00000000000${++n}`, createdAt: n };
      rows.push(row);
      return row;
    },
    remove: async (uid, id) => {
      const i = rows.findIndex((r) => r.uid === uid && r.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
    clear: async (uid) => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.uid === uid) rows.splice(i, 1);
    },
  };
}

function setup(over: Partial<NonNullable<AppDeps["account"]>> = {}) {
  const history = memoryHistory();
  const publish = vi.fn(async () => ({ url: "https://github.com/a/b/pull/7", number: 7, branch: "readmecraft/readme-1" }));
  const app = createApp({
    account: { oauth, codec, secureCookies: true, history, publisher: () => ({ publish }), ...over },
  });
  return { app, history, publish };
}

async function sessionCookie(uid = 42) {
  return `${SESSION_COOKIE}=${await codec.seal({ uid, login: "octo", avatar: "https://avatars/1", token: "gho_test" })}`;
}

describe("sessão cifrada", () => {
  it("abre o que selou e rejeita adulteração, lixo e expiração", async () => {
    const sealed = await codec.seal({ uid: 1, login: "a", avatar: "", token: "t" });
    expect(await codec.open(sealed)).toMatchObject({ uid: 1, login: "a", token: "t" });
    expect(sealed).not.toContain("t\"");
    const [iv, data] = sealed.split(".");
    const flipped = `${iv}.${data!.slice(0, -2)}${data!.endsWith("A") ? "B" : "A"}${data!.slice(-1)}`;
    expect(await codec.open(flipped)).toBeNull();
    expect(await codec.open("lixo")).toBeNull();
    expect(await createSessionCodec("y".repeat(40)).open(sealed)).toBeNull();
    const later = createSessionCodec(SECRET, () => Date.now() + 9 * 60 * 60 * 1000);
    expect(await later.open(sealed)).toBeNull();
  });

  it("exige segredo forte", () => {
    expect(() => createSessionCodec("curto")).toThrow(/32/);
  });
});

describe("OAuth do GitHub", () => {
  it("health anuncia os recursos ativos", async () => {
    const { app } = setup();
    expect(await (await app.request("/api/health")).json()).toMatchObject({ features: { login: true, history: true } });
  });

  it("login redireciona com state, escopo mínimo e redirect_uri fixo", async () => {
    const res = await setup().app.request("/api/auth/login");
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("scope")).toBe("public_repo");
    expect(location.searchParams.get("redirect_uri")).toBe("https://rc.example.com/api/auth/callback");
    const state = location.searchParams.get("state");
    expect(state).toHaveLength(32);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`${STATE_COOKIE}=${state}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("callback rejeita state ausente ou divergente (CSRF)", async () => {
    const { app } = setup();
    const res = await app.request("/api/auth/callback?code=c&state=abc", { headers: { Cookie: `${STATE_COOKIE}=outro` } });
    expect(res.headers.get("location")).toBe("/?auth_error=state");
    const res2 = await app.request("/api/auth/callback?code=c&state=abc");
    expect(res2.headers.get("location")).toBe("/?auth_error=state");
  });

  it("callback troca o code, cria sessão cifrada e redireciona", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      if (String(url).includes("access_token")) return new Response(JSON.stringify({ access_token: "gho_abc", scope: "public_repo" }));
      return new Response(JSON.stringify({ id: 99, login: "octo", avatar_url: "https://a/1" }));
    });
    const { app } = setup({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await app.request("/api/auth/callback?code=c0de&state=s1", { headers: { Cookie: `${STATE_COOKIE}=s1` } });
    expect(res.headers.get("location")).toBe("/");
    const tokenCall = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(String((tokenCall[1] as RequestInit).body))).toMatchObject({ client_id: "cid", client_secret: "csecret", code: "c0de" });
    const sessionHeader = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(sessionHeader).not.toContain("gho_abc");
    const me = await app.request("/api/auth/me", { headers: { Cookie: sessionHeader.split(";")[0]! } });
    expect(await me.json()).toEqual({ authenticated: true, user: { login: "octo", avatar: "https://a/1" } });
  });

  it("logout limpa o cookie", async () => {
    const res = await setup().app.request("/api/auth/logout", json({}, { Cookie: await sessionCookie() }));
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Max-Age=0`, "i"));
  });
});

describe("publicação via PR", () => {
  it("exige sessão", async () => {
    const res = await setup().app.request("/api/github/publish", json({ repo: "a/b", markdown: "# x" }));
    expect(res.status).toBe(401);
  });

  it("publica README e só inclui o banner quando o README o referencia", async () => {
    const { app, publish } = setup();
    const cookie = await sessionCookie();
    const ok = await app.request("/api/github/publish", json({ repo: "https://github.com/a/b", markdown: "# x", bannerSvg: "<svg/>" }, { Cookie: cookie }));
    expect(await ok.json()).toEqual({ url: "https://github.com/a/b/pull/7", number: 7, branch: "readmecraft/readme-1" });
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ ref: { owner: "a", repo: "b" }, files: [{ path: "README.md", content: "# x" }] }));

    await app.request("/api/github/publish", json({ repo: "a/b", markdown: '<img src="./assets/banner.svg">', bannerSvg: "<svg/>" }, { Cookie: cookie }));
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ files: expect.arrayContaining([{ path: "assets/banner.svg", content: "<svg/>" }]) }));
  });

  it("valida repositório e conteúdo do banner", async () => {
    const { app } = setup();
    const cookie = await sessionCookie();
    expect((await app.request("/api/github/publish", json({ repo: "https://evil.com/a/b", markdown: "x" }, { Cookie: cookie }))).status).toBe(400);
    expect((await app.request("/api/github/publish", json({ repo: "a/b", markdown: "x", bannerSvg: "<script>" }, { Cookie: cookie }))).status).toBe(400);
  });

  it("bloqueia publicação cross-site", async () => {
    const res = await setup().app.request("/api/github/publish", json({ repo: "a/b", markdown: "x" }, { Cookie: await sessionCookie(), "Sec-Fetch-Site": "cross-site" }));
    expect(res.status).toBe(403);
  });
});

describe("histórico remoto", () => {
  const entry = { title: "app", template: "showcase", origin: "claude", markdown: "# v1" };

  it("isola as versões por usuário da sessão", async () => {
    const { app } = setup();
    const alice = await sessionCookie(1);
    const bob = await sessionCookie(2);
    expect((await app.request("/api/history", json(entry, { Cookie: alice }))).status).toBe(201);
    const listBob = await (await app.request("/api/history", { headers: { Cookie: bob } })).json();
    expect(listBob.entries).toEqual([]);
    const listAlice = await (await app.request("/api/history", { headers: { Cookie: alice } })).json();
    expect(listAlice.entries).toHaveLength(1);

    const id = listAlice.entries[0].id;
    await app.request(`/api/history/${id}`, { method: "DELETE", headers: { Cookie: bob } });
    expect((await (await app.request("/api/history", { headers: { Cookie: alice } })).json()).entries).toHaveLength(1);
    await app.request(`/api/history/${id}`, { method: "DELETE", headers: { Cookie: alice } });
    expect((await (await app.request("/api/history", { headers: { Cookie: alice } })).json()).entries).toHaveLength(0);
  });

  it("valida entrada e id", async () => {
    const { app } = setup();
    const cookie = await sessionCookie();
    expect((await app.request("/api/history", json({ ...entry, template: "x" }, { Cookie: cookie }))).status).toBe(400);
    expect((await app.request("/api/history/nao-uuid", { method: "DELETE", headers: { Cookie: cookie } })).status).toBe(400);
    expect((await app.request("/api/history")).status).toBe(401);
  });

  it("sem Supabase configurado, as rotas não existem", async () => {
    const { app } = setup({ history: null });
    expect((await app.request("/api/history", { headers: { Cookie: await sessionCookie() } })).status).toBe(404);
  });
});

describe("createGithubPublisher", () => {
  function githubMock(opts: { push?: boolean; readmeExists?: boolean } = {}) {
    const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).replace("https://api.github.com", "");
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (method === "GET" && path === "/repos/a/b") return ok({ default_branch: "main", archived: false, permissions: { push: opts.push ?? true } });
      if (path === "/repos/a/b/git/ref/heads/main") return ok({ object: { sha: "base123" } });
      if (method === "POST" && path === "/repos/a/b/git/refs") return ok({}, 201);
      if (method === "GET" && path.startsWith("/repos/a/b/contents/README.md")) return opts.readmeExists ? ok({ sha: "old" }) : ok({ message: "Not Found" }, 404);
      if (method === "GET" && path.startsWith("/repos/a/b/contents/")) return ok({}, 404);
      if (method === "PUT") return ok({}, 201);
      if (method === "POST" && path === "/repos/a/b/pulls") return ok({ html_url: "https://github.com/a/b/pull/3", number: 3 }, 201);
      return ok({ message: "?" }, 500);
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
  }

  it("cria branch, grava arquivos (atualizando o README existente) e abre PR", async () => {
    const { fetchImpl, calls } = githubMock({ readmeExists: true });
    const publisher = createGithubPublisher("tok", { fetchImpl, now: () => new Date("2026-10-13T12:34:56Z") });
    const res = await publisher.publish({ ref: { owner: "a", repo: "b" }, title: "docs", files: [{ path: "README.md", content: "# Olá" }, { path: "assets/banner.svg", content: "<svg/>" }] });
    expect(res).toEqual({ url: "https://github.com/a/b/pull/3", number: 3, branch: "readmecraft/readme-20261013123456" });
    expect(calls.find((c) => c.path === "/repos/a/b/git/refs")?.body).toEqual({ ref: "refs/heads/readmecraft/readme-20261013123456", sha: "base123" });
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts[0]?.body).toMatchObject({ branch: "readmecraft/readme-20261013123456", sha: "old", content: Buffer.from("# Olá").toString("base64") });
    expect(puts[1]?.body).not.toHaveProperty("sha");
    expect(calls.find((c) => c.path === "/repos/a/b/pulls")?.body).toMatchObject({ head: "readmecraft/readme-20261013123456", base: "main" });
    expect(calls.some((c) => c.method === "PUT" && c.body?.branch === "main")).toBe(false);
  });

  it("recusa sem permissão de escrita, antes de criar qualquer coisa", async () => {
    const { fetchImpl, calls } = githubMock({ push: false });
    await expect(createGithubPublisher("tok", { fetchImpl }).publish({ ref: { owner: "a", repo: "b" }, title: "t", files: [] })).rejects.toMatchObject({ status: 403 });
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
});

describe("clientIpResolver", () => {
  const ctx = (headers: Record<string, string>) => ({ req: { header: (k: string) => headers[k.toLowerCase()] } }) as never;

  it("na Vercel usa x-real-ip", () => {
    expect(clientIpResolver("vercel")(ctx({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
  });

  it("atrás de proxy genérico usa a entrada mais à direita do XFF", () => {
    expect(clientIpResolver("1")(ctx({ "x-forwarded-for": "6.6.6.6, 5.5.5.5" }))).toBe("5.5.5.5");
  });

  it("sem proxy ignora cabeçalhos forjáveis", () => {
    expect(clientIpResolver(undefined, () => "7.7.7.7")(ctx({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "6.6.6.6" }))).toBe("7.7.7.7");
  });
});
