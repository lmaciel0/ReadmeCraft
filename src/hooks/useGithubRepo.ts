import { useCallback, useRef, useState } from "react";
import { analyzeRepo } from "../services/aiService";
import { parseGithubUrl } from "../services/githubService";
import type { RepoMetadata } from "../types/github";

export type RepoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; metadata: RepoMetadata }
  | { status: "error"; error: string };

export function useGithubRepo() {
  const [state, setState] = useState<RepoState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  const analyze = useCallback(async (url: string): Promise<RepoMetadata | null> => {
    if (!parseGithubUrl(url)) {
      setState({ status: "error", error: "URL inválida. Use https://github.com/<owner>/<repo>." });
      return null;
    }
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setState({ status: "loading" });
    try {
      const metadata = await analyzeRepo(url, ctrl.signal);
      setState({ status: "success", metadata });
      return metadata;
    } catch (err) {
      if (ctrl.signal.aborted) return null;
      setState({ status: "error", error: err instanceof Error ? err.message : "Falha ao analisar o repositório." });
      return null;
    }
  }, []);

  /** Define metadados vindos do modo manual. */
  const setManual = useCallback((metadata: RepoMetadata) => setState({ status: "success", metadata }), []);

  return { state, analyze, setManual };
}
