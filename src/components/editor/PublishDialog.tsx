import { useId, useState, type FormEvent } from "react";
import { ExternalLink, GitPullRequest } from "lucide-react";
import type { AuthState } from "../../hooks/useAuth";
import { BANNER_PATH } from "../../services/bannerGenerator";
import { parseGithubUrl } from "../../services/githubService";
import { publishReadme, type PublishResult } from "../../services/aiService";
import { Button } from "../common/Button";

interface Props {
  auth: AuthState;
  onLogin: () => void;
  defaultRepo?: string;
  markdown: string;
  bannerSvg: string | null;
}

/** Publica o README via Pull Request no repositório escolhido (nunca direto na branch padrão). */
export function PublishDialog({ auth, onLogin, defaultRepo = "", markdown, bannerSvg }: Props) {
  const [repo, setRepo] = useState(defaultRepo);
  const [state, setState] = useState<{ status: "idle" | "loading" } | { status: "done"; result: PublishResult } | { status: "error"; error: string }>({
    status: "idle",
  });
  const inputId = useId();
  const includesBanner = Boolean(bannerSvg) && markdown.includes(BANNER_PATH);

  if (auth.status !== "authenticated") {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-muted">Entre com o GitHub para abrir um Pull Request com o README no seu repositório. O ReadmeCraft pede só acesso a repositórios públicos.</p>
        <Button variant="primary" icon={<GitPullRequest className="size-4" />} onClick={onLogin}>
          Entrar com GitHub
        </Button>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parseGithubUrl(repo)) {
      setState({ status: "error", error: "Repositório inválido. Use owner/repo." });
      return;
    }
    setState({ status: "loading" });
    try {
      const result = await publishReadme({ repo: repo.trim(), markdown, bannerSvg: includesBanner ? bannerSvg! : undefined });
      setState({ status: "done", result });
    } catch (err) {
      setState({ status: "error", error: err instanceof Error ? err.message : "Falha ao publicar." });
    }
  };

  if (state.status === "done") {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-fg">
          Pull Request <strong>#{state.result.number}</strong> aberto na branch <code className="font-mono">{state.result.branch}</code>.
        </p>
        <a href={state.result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-accent underline">
          Abrir no GitHub <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm" noValidate>
      <p className="text-muted">
        Cria a branch <code className="font-mono">readmecraft/readme-…</code> com o <code className="font-mono">README.md</code>
        {includesBanner && (
          <>
            {" "}e o <code className="font-mono">assets/banner.svg</code>
          </>
        )}{" "}
        e abre um Pull Request. Nada é gravado direto na branch padrão.
      </p>
      <label htmlFor={inputId} className="block space-y-1 text-xs text-muted">
        <span>Repositório de destino (você precisa ter permissão de escrita)</span>
        <input
          id={inputId}
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repo"
          className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 font-mono text-sm text-fg"
          aria-invalid={state.status === "error" || undefined}
        />
      </label>
      {state.status === "error" && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" icon={<GitPullRequest className="size-4" />} loading={state.status === "loading"} disabled={!repo.trim() || !markdown.trim()}>
          Abrir Pull Request
        </Button>
      </div>
    </form>
  );
}
