import { describe, expect, it, vi } from "vitest";
import { GithubError, fetchRepoMetadata, parseGithubUrl, toPercentages } from "../../src/services/githubService";

describe("parseGithubUrl", () => {
  it.each([
    ["https://github.com/honojs/hono", { owner: "honojs", repo: "hono" }],
    ["github.com/honojs/hono", { owner: "honojs", repo: "hono" }],
    ["https://www.github.com/honojs/hono.git", { owner: "honojs", repo: "hono" }],
    ["https://github.com/vercel/next.js/tree/canary/packages", { owner: "vercel", repo: "next.js" }],
    ["  pmndrs/zustand  ", { owner: "pmndrs", repo: "zustand" }],
  ])("aceita %s", (input, expected) => {
    expect(parseGithubUrl(input)).toEqual(expected);
  });

  it.each([
    "",
    "https://gitlab.com/a/b",
    "https://github.com.evil.com/a/b",
    "https://evil.com/github.com/a/b",
    "https://user:pass@github.com/a/b",
    "https://github.com:8080/a/b",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://github.com/only-owner",
    "https://github.com/-bad/repo",
    "https://github.com/ok/..",
    "http://169.254.169.254/latest/meta-data",
    `https://github.com/a/${"x".repeat(400)}`,
  ])("rejeita %s", (input) => {
    expect(parseGithubUrl(input)).toBeNull();
  });
});

describe("toPercentages", () => {
  it("converte bytes em percentuais com 1 casa", () => {
    expect(toPercentages({ TypeScript: 750, CSS: 250 })).toEqual({ TypeScript: 75, CSS: 25 });
    expect(toPercentages({})).toEqual({});
  });
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}

function mockGithub(routes: Record<string, Response | (() => Response)>) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const path = url.replace("https://api.github.com", "");
    const route = routes[path];
    if (!route) return jsonResponse({ message: "Not Found" }, 404);
    return typeof route === "function" ? route() : route.clone();
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe("fetchRepoMetadata", () => {
  const repo = {
    name: "acme-api",
    full_name: "acme/acme-api",
    html_url: "https://github.com/acme/acme-api",
    description: "API de pedidos",
    homepage: "",
    topics: ["api"],
    license: { spdx_id: "MIT", name: "MIT License" },
    stargazers_count: 10,
    forks_count: 2,
    open_issues_count: 1,
    default_branch: "main",
    owner: { login: "acme" },
    private: false,
  };
  const tree = {
    truncated: false,
    tree: [
      { path: "src", type: "tree" },
      { path: "src/index.ts", type: "blob", size: 100 },
      { path: "package.json", type: "blob", size: 200 },
      { path: ".env.example", type: "blob", size: 20 },
      { path: "node_modules/x/package.json", type: "blob", size: 10 },
    ],
  };

  it("monta os metadados a partir das rotas da API e lê apenas manifestos", async () => {
    const { fetchImpl, calls } = mockGithub({
      "/repos/acme/acme-api": jsonResponse(repo),
      "/repos/acme/acme-api/languages": jsonResponse({ TypeScript: 900, Shell: 100 }),
      "/repos/acme/acme-api/git/trees/main?recursive=1": jsonResponse(tree),
      "/repos/acme/acme-api/contents/package.json?ref=main": jsonResponse(JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "19" } })),
      "/repos/acme/acme-api/contents/.env.example?ref=main": jsonResponse("API_URL=x\nSECRET=y"),
    });

    const meta = await fetchRepoMetadata({ owner: "acme", repo: "acme-api" }, { fetchImpl, token: "tkn" });
    expect(meta).toMatchObject({
      source: "github",
      name: "acme-api",
      owner: "acme",
      description: "API de pedidos",
      license: { spdxId: "MIT" },
      languages: { TypeScript: 90, Shell: 10 },
      envVars: ["API_URL", "SECRET"],
      defaultBranch: "main",
    });
    expect(meta.homepage).toBeUndefined();
    expect(meta.latestRelease).toBeUndefined();
    expect(meta.tree.some((t) => t.path.startsWith("node_modules"))).toBe(false);
    expect(meta.techStack.map((t) => t.name)).toContain("React");
    expect(calls.every((u) => u.startsWith("https://api.github.com/repos/acme/acme-api"))).toBe(true);
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tkn");
  });

  it("propaga 404 como GithubError", async () => {
    const { fetchImpl } = mockGithub({});
    await expect(fetchRepoMetadata({ owner: "a", repo: "b" }, { fetchImpl })).rejects.toMatchObject({ name: "GithubError", status: 404 });
  });

  it("traduz rate limit esgotado em erro 429 com dica do token", async () => {
    const { fetchImpl } = mockGithub({ "/repos/a/b": jsonResponse({}, 403, { "x-ratelimit-remaining": "0" }) });
    const err = await fetchRepoMetadata({ owner: "a", repo: "b" }, { fetchImpl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GithubError);
    expect((err as GithubError).status).toBe(429);
    expect((err as GithubError).message).toMatch(/GITHUB_TOKEN/);
  });

  it("recusa repositórios privados", async () => {
    const { fetchImpl } = mockGithub({ "/repos/a/b": jsonResponse({ ...repo, private: true }) });
    await expect(fetchRepoMetadata({ owner: "a", repo: "b" }, { fetchImpl })).rejects.toMatchObject({ status: 403 });
  });
});

describe("falhas de rede", () => {
  it("convertem-se em GithubError 504", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchRepoMetadata({ owner: "a", repo: "b" }, { fetchImpl })).rejects.toMatchObject({ name: "GithubError", status: 504 });
  });
});
