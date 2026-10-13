import { GithubError } from "../src/services/githubService";
import type { RepoRef } from "../src/types/github";

const API = "https://api.github.com";

export interface PublishFile {
  path: string;
  content: string;
}

export interface PublishInput {
  ref: RepoRef;
  files: PublishFile[];
  title: string;
}

export interface PublishResult {
  url: string;
  number: number;
  branch: string;
}

const enc = encodeURIComponent;
const encPath = (path: string) => path.split("/").map(enc).join("/");

/**
 * Publica arquivos num repositório via Pull Request, com o token do usuário:
 * cria uma branch a partir da branch padrão, grava cada arquivo e abre o PR.
 * Nunca escreve direto na branch padrão.
 */
export function createGithubPublisher(token: string, { fetchImpl = fetch, now = () => new Date() }: { fetchImpl?: typeof fetch; now?: () => Date } = {}) {
  async function call<T>(method: string, path: string, body?: unknown, allow404 = false): Promise<T | null> {
    let res: Response;
    try {
      res = await fetchImpl(`${API}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ReadmeCraft",
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new GithubError(504, "Não foi possível conectar à API do GitHub.");
    }
    if (res.status === 404 && allow404) return null;
    if (!res.ok) {
      if (res.status === 401) throw new GithubError(401, "Sessão do GitHub expirada. Entre novamente.");
      if (res.status === 403 || res.status === 404) throw new GithubError(403, "Sem permissão de escrita nesse repositório.");
      if (res.status === 422) throw new GithubError(422, "O GitHub recusou a alteração (verifique se o repositório não está vazio ou arquivado).");
      throw new GithubError(502, `Falha na API do GitHub (HTTP ${res.status}).`);
    }
    return (await res.json()) as T;
  }

  return {
    async publish({ ref, files, title }: PublishInput): Promise<PublishResult> {
      const base = `/repos/${enc(ref.owner)}/${enc(ref.repo)}`;
      const repo = await call<{ default_branch: string; archived: boolean; permissions?: { push?: boolean } }>("GET", base);
      if (!repo) throw new GithubError(404, "Repositório não encontrado.");
      if (repo.archived) throw new GithubError(422, "O repositório está arquivado.");
      if (!repo.permissions?.push) throw new GithubError(403, "Você não tem permissão de escrita nesse repositório.");

      const head = await call<{ object: { sha: string } }>("GET", `${base}/git/ref/heads/${encPath(repo.default_branch)}`);
      const stamp = now().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const branch = `readmecraft/readme-${stamp}`;
      await call("POST", `${base}/git/refs`, { ref: `refs/heads/${branch}`, sha: head!.object.sha });

      for (const file of files) {
        const existing = await call<{ sha: string }>("GET", `${base}/contents/${encPath(file.path)}?ref=${enc(branch)}`, undefined, true);
        await call("PUT", `${base}/contents/${encPath(file.path)}`, {
          message: `docs: atualiza ${file.path} com o ReadmeCraft`,
          content: Buffer.from(file.content, "utf8").toString("base64"),
          branch,
          ...(existing?.sha ? { sha: existing.sha } : {}),
        });
      }

      const pr = await call<{ html_url: string; number: number }>("POST", `${base}/pulls`, {
        title,
        head: branch,
        base: repo.default_branch,
        body: [
          "README gerado com o [ReadmeCraft](https://github.com/lmaciel0/ReadmeCraft).",
          "",
          "Arquivos alterados:",
          ...files.map((f) => `- \`${f.path}\``),
          "",
          "Revise os comandos e textos antes de fazer o merge.",
        ].join("\n"),
      });
      return { url: pr!.html_url, number: pr!.number, branch };
    },
  };
}
