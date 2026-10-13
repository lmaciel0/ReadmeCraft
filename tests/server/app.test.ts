// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createApp, publicErrorMessage, STREAM_ERROR_MARKER, type ReadmeStreamer } from "../../server/app";
import { createRateLimiter, createTtlCache, rateLimitKey } from "../../server/rateLimit";
import { GithubError } from "../../src/services/githubService";
import { defaultOptions, makeNodeMetadata } from "../fixtures/metadata";

const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const meta = makeNodeMetadata();

describe("GET /api/health", () => {
  it("informa modo template quando não há IA", async () => {
    const res = await createApp().request("/api/health");
    expect(await res.json()).toEqual({ ok: true, ai: false, model: null });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("informa o modelo quando a IA está ativa", async () => {
    const app = createApp({ aiStreamer: async function* () {}, model: "claude-opus-5-5" });
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true, ai: true, model: "claude-opus-5-5" });
  });
});

describe("POST /api/repo/analyze", () => {
  it("valida a URL antes de chamar o GitHub (proteção SSRF)", async () => {
    const fetchRepo = vi.fn();
    const app = createApp({ fetchRepo });
    for (const url of ["http://169.254.169.254/latest", "https://evil.com/a/b", ""]) {
      const res = await app.request("/api/repo/analyze", json({ url }));
      expect(res.status).toBe(400);
    }
    expect((await app.request("/api/repo/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: "not json" })).status).toBe(400);
    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it("retorna metadados e usa cache para o mesmo repositório", async () => {
    const fetchRepo = vi.fn(async () => meta);
    const app = createApp({ fetchRepo });
    const first = await app.request("/api/repo/analyze", json({ url: "https://github.com/acme/acme-api" }));
    expect(await first.json()).toMatchObject({ cached: false, metadata: { name: "acme-api" } });
    const second = await app.request("/api/repo/analyze", json({ url: "ACME/acme-api" }));
    expect(await second.json()).toMatchObject({ cached: true });
    expect(fetchRepo).toHaveBeenCalledTimes(1);
    expect(fetchRepo).toHaveBeenCalledWith({ owner: "acme", repo: "acme-api" });
  });

  it("propaga erros do GitHub com status e mensagem amigável", async () => {
    const app = createApp({ fetchRepo: async () => Promise.reject(new GithubError(404, "Repositório não encontrado")) });
    const res = await app.request("/api/repo/analyze", json({ url: "a/b" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Repositório não encontrado" });
  });

  it("não vaza detalhes de erros inesperados", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({ fetchRepo: async () => Promise.reject(new Error("ECONNRESET token=abc")) });
    const res = await app.request("/api/repo/analyze", json({ url: "a/b" }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("token");
    spy.mockRestore();
  });

  it("aplica rate limit por IP", async () => {
    const app = createApp({ fetchRepo: async () => meta, rateLimits: { analyzePerMin: 2, generatePerMin: 1, generatePerDay: 100 }, getClientIp: () => "1.2.3.4" });
    await app.request("/api/repo/analyze", json({ url: "a/b" }));
    await app.request("/api/repo/analyze", json({ url: "a/b" }));
    const res = await app.request("/api/repo/analyze", json({ url: "a/b" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("rejeita payloads grandes demais", async () => {
    const res = await createApp().request("/api/repo/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": String(600 * 1024) },
      body: JSON.stringify({ url: "x".repeat(600 * 1024) }),
    });
    expect(res.status).toBe(413);
  });
});

describe("POST /api/generate", () => {
  it("rejeita metadados/opções inválidos", async () => {
    const app = createApp();
    expect((await app.request("/api/generate", json({ metadata: { name: "x" }, options: defaultOptions }))).status).toBe(400);
    expect((await app.request("/api/generate", json({ metadata: meta, options: { ...defaultOptions, template: "evil" } }))).status).toBe(400);
    expect((await app.request("/api/generate", json({ metadata: meta, options: { ...defaultOptions, extraInstructions: "x".repeat(2000) } }))).status).toBe(400);
  });

  it("faz streaming do README em modo template", async () => {
    const app = createApp({ templateChunkDelayMs: 0 });
    const res = await app.request("/api/generate", json({ metadata: meta, options: defaultOptions }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-generator-engine")).toBe("template");
    const text = await res.text();
    expect(text).toContain("<!-- rc:section=header -->");
    expect(text).toContain("# acme-api");
  });

  it("usa o streamer de IA quando configurado", async () => {
    const aiStreamer: ReadmeStreamer = async function* (_m, options) {
      yield "<!-- rc:section=header -->\n";
      yield `# ${options.language}`;
    };
    const res = await createApp({ aiStreamer }).request("/api/generate", json({ metadata: meta, options: defaultOptions }));
    expect(res.headers.get("x-generator-engine")).toBe("claude");
    expect(await res.text()).toBe("<!-- rc:section=header -->\n# pt-BR");
  });

  it("retorna 502 JSON quando a IA falha antes do primeiro bloco", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // eslint-disable-next-line require-yield -- falha antes de produzir qualquer bloco
    const aiStreamer: ReadmeStreamer = async function* () {
      throw Object.assign(new Error("boom"), { status: 401 });
    };
    const res = await createApp({ aiStreamer }).request("/api/generate", json({ metadata: meta, options: defaultOptions }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Credenciais da Anthropic inválidas no servidor." });
    spy.mockRestore();
  });

  it("anexa marcador de erro quando a IA falha no meio do stream", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const aiStreamer: ReadmeStreamer = async function* () {
      yield "# parcial";
      throw Object.assign(new Error("overloaded"), { status: 529 });
    };
    const res = await createApp({ aiStreamer }).request("/api/generate", json({ metadata: meta, options: defaultOptions }));
    const text = await res.text();
    expect(text.startsWith("# parcial")).toBe(true);
    expect(text).toContain(STREAM_ERROR_MARKER);
    spy.mockRestore();
  });
});

describe("publicErrorMessage", () => {
  it("mapeia status sem expor detalhes", () => {
    expect(publicErrorMessage({ status: 429 })).toMatch(/Limite/);
    expect(publicErrorMessage(new Error("sk-ant-secret"))).toBe("Falha ao gerar o README.");
  });
});

describe("rate limiter e cache", () => {
  it("reinicia a janela após o tempo", () => {
    let now = 0;
    const check = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(check("ip").allowed).toBe(true);
    expect(check("ip").allowed).toBe(false);
    now = 1001;
    expect(check("ip").allowed).toBe(true);
  });

  it("expira entradas do cache", () => {
    let now = 0;
    const cache = createTtlCache<number>({ ttlMs: 100, maxEntries: 2, now: () => now });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    now = 200;
    expect(cache.get("c")).toBeUndefined();
  });
});

describe("proteções contra abuso cross-site", () => {
  const body = JSON.stringify({ metadata: meta, options: defaultOptions });

  it("recusa POST sem Content-Type JSON (fetch no-cors com text/plain)", async () => {
    const res = await createApp().request("/api/generate", { method: "POST", headers: { "Content-Type": "text/plain" }, body });
    expect(res.status).toBe(415);
  });

  it("recusa requisições cross-site por Sec-Fetch-Site e Origin", async () => {
    const app = createApp({ templateChunkDelayMs: 0 });
    const cross = await app.request("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" }, body });
    expect(cross.status).toBe(403);
    const origin = await app.request("http://app.local/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.com", Host: "app.local" },
      body,
    });
    expect(origin.status).toBe(403);
    const same = await app.request("http://app.local/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://app.local", Host: "app.local", "Sec-Fetch-Site": "same-origin" },
      body,
    });
    expect(same.status).toBe(200);
  });

  it("aplica orçamento diário global independente do IP", async () => {
    let ip = 0;
    const app = createApp({ templateChunkDelayMs: 0, rateLimits: { analyzePerMin: 10, generatePerMin: 10, generatePerDay: 2 }, getClientIp: () => `ip-${ip++}` });
    const send = () => app.request("/api/generate", json({ metadata: meta, options: defaultOptions }));
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });

  it("envia cabeçalhos de segurança também nas respostas da API", async () => {
    const res = await createApp().request("/api/health");
    expect(res.headers.get("content-security-policy")).toContain("form-action 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("agrupa IPv6 por /64 e normaliza IPv4 mapeado", () => {
    expect(rateLimitKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(rateLimitKey("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(rateLimitKey("10.0.0.1")).toBe("10.0.0.1");
  });

  it("rate limiter recusa novas chaves quando o teto de memória é atingido", () => {
    const check = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 2, now: () => 0 });
    expect(check("a").allowed).toBe(true);
    expect(check("b").allowed).toBe(true);
    expect(check("c").allowed).toBe(false);
    expect(check("a").allowed).toBe(true);
  });
});
