import type { RepoMetadata, RepoRef, TreeEntry } from "../types/github";
import { buildMetadata, filterTree, pickEnvExamplePath, pickManifestPaths } from "./metadataBuilder";

const API = "https://api.github.com";
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Converte a entrada do usuário em `{ owner, repo }`.
 * Aceita `owner/repo`, `https://github.com/owner/repo[.git][/...]` e `github.com/owner/repo`.
 * Qualquer outro host é rejeitado — a URL final é sempre montada contra api.github.com,
 * o que impede SSRF por meio de URLs arbitrárias.
 */
export function parseGithubUrl(input: string): RepoRef | null {
  const raw = input.trim();
  if (!raw || raw.length > 300) return null;

  let segments: string[];
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) {
    segments = raw.split("/");
  } else {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (host !== "github.com" && host !== "www.github.com") return null;
    if (url.username || url.password || url.port) return null;
    segments = url.pathname.split("/").filter(Boolean);
  }

  const [owner, repoRaw] = segments;
  if (!owner || !repoRaw) return null;
  const repo = repoRaw.replace(/\.git$/i, "");
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo };
}

export class GithubError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GithubError";
  }
}

export interface GithubClientOptions {
  token?: string;
  fetchImpl?: typeof fetch;
  /** Máximo de manifestos baixados por análise. */
  maxManifests?: number;
  timeoutMs?: number;
}

interface RepoResponse {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  topics?: string[];
  license: { spdx_id: string | null; name: string } | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  owner: { login: string };
  private: boolean;
}

interface TreeResponse {
  truncated: boolean;
  tree: { path: string; type: "blob" | "tree" | "commit"; size?: number }[];
}

interface ReleaseResponse {
  tag_name: string;
  name: string | null;
  html_url: string;
}

export function createGithubClient({ token, fetchImpl = fetch, timeoutMs = 15_000 }: GithubClientOptions = {}) {
  async function request<T>(path: string, accept = "application/vnd.github+json"): Promise<T> {
    const headers: Record<string, string> = {
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ReadmeCraft",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetchImpl(`${API}${path}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new GithubError(504, "Não foi possível conectar à API do GitHub. Verifique a rede e tente novamente.");
    }
    if (!res.ok) {
      if (res.status === 404) throw new GithubError(404, "Repositório ou recurso não encontrado (verifique se é público).");
      if (res.status === 403 || res.status === 429) {
        const remaining = res.headers.get("x-ratelimit-remaining");
        throw new GithubError(
          429,
          remaining === "0"
            ? "Limite de requisições da API do GitHub atingido. Configure GITHUB_TOKEN no servidor ou tente mais tarde."
            : "Acesso negado pela API do GitHub.",
        );
      }
      throw new GithubError(502, `Falha na API do GitHub (HTTP ${res.status}).`);
    }
    return (accept.includes("raw") ? await res.text() : await res.json()) as T;
  }

  return { request };
}

const enc = encodeURIComponent;
const encPath = (path: string) => path.split("/").map(enc).join("/");

/** Busca metadados, árvore, linguagens, release e manifestos de um repositório público. */
export async function fetchRepoMetadata(ref: RepoRef, options: GithubClientOptions = {}): Promise<RepoMetadata> {
  const { request } = createGithubClient(options);
  const base = `/repos/${enc(ref.owner)}/${enc(ref.repo)}`;

  const repo = await request<RepoResponse>(base);
  if (repo.private) throw new GithubError(403, "Somente repositórios públicos são suportados.");

  const [languagesBytes, treeRes, release] = await Promise.all([
    request<Record<string, number>>(`${base}/languages`).catch(() => ({})),
    request<TreeResponse>(`${base}/git/trees/${enc(repo.default_branch)}?recursive=1`),
    request<ReleaseResponse>(`${base}/releases/latest`).catch(() => null),
  ]);

  const tree: TreeEntry[] = filterTree(
    treeRes.tree
      .filter((t) => t.type === "blob" || t.type === "tree")
      .map((t) => ({ path: t.path, type: t.type === "tree" ? "dir" : "file", size: t.size })),
  );

  const wanted = pickManifestPaths(tree, options.maxManifests ?? 8);
  const envPath = pickEnvExamplePath(tree);
  if (envPath) wanted.push(envPath);

  const contents = await Promise.all(
    wanted.map(async (path) => {
      try {
        const text = await request<string>(
          `${base}/contents/${encPath(path)}?ref=${enc(repo.default_branch)}`,
          "application/vnd.github.raw+json",
        );
        return [path, text.slice(0, 256_000)] as const;
      } catch {
        return null;
      }
    }),
  );
  const files = Object.fromEntries(contents.filter((c): c is readonly [string, string] => c !== null));

  return buildMetadata({
    source: "github",
    name: repo.name,
    tree,
    files,
    languages: toPercentages(languagesBytes),
    extra: {
      owner: repo.owner.login,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description ?? undefined,
      homepage: repo.homepage || undefined,
      topics: repo.topics ?? [],
      license:
        repo.license && repo.license.spdx_id && repo.license.spdx_id !== "NOASSERTION"
          ? { spdxId: repo.license.spdx_id, name: repo.license.name }
          : undefined,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      defaultBranch: repo.default_branch,
      latestRelease: release
        ? { tag: release.tag_name, name: release.name ?? undefined, url: release.html_url }
        : undefined,
      treeTruncated: treeRes.truncated || treeRes.tree.length > tree.length,
    },
  });
}

export function toPercentages(bytes: Record<string, number>): Record<string, number> {
  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  if (!total) return {};
  return Object.fromEntries(
    Object.entries(bytes)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, n]) => [lang, Math.round((n / total) * 1000) / 10]),
  );
}
