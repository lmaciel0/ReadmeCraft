import { useCallback, useEffect, useRef, useState } from "react";
import { replaceSection } from "../lib/sections";
import { streamGenerate } from "../services/aiService";
import type { RepoMetadata } from "../types/github";
import type { GeneratorEngine, GeneratorOptions } from "../types/readme";
import type { SectionId } from "../types/template";

export type GeneratorState =
  | { status: "idle" }
  | { status: "streaming"; section: SectionId | null }
  | { status: "done"; engine: GeneratorEngine }
  | { status: "error"; error: string };

interface Params {
  markdown: string;
  setMarkdown: (value: string) => void;
  onError?: (message: string) => void;
  /** Chamado com o README completo ao fim de uma geração bem-sucedida. */
  onComplete?: (markdown: string, engine: GeneratorEngine) => void;
}

export function useReadmeGenerator({ markdown, setMarkdown, onError, onComplete }: Params) {
  const [state, setState] = useState<GeneratorState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  const markdownRef = useRef(markdown);
  const onErrorRef = useRef(onError);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    markdownRef.current = markdown;
    onErrorRef.current = onError;
    onCompleteRef.current = onComplete;
  }, [markdown, onError, onComplete]);
  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    async (
      metadata: RepoMetadata,
      options: GeneratorOptions,
      apply: (partial: string) => string,
      { base, restoreOnAbort }: { base: string; restoreOnAbort: boolean },
    ) => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      setState({ status: "streaming", section: options.onlySection ?? null });
      try {
        const { text, engine } = await streamGenerate({
          metadata,
          options,
          signal: ctrl.signal,
          onText: (partial) => {
            if (controller.current === ctrl) setMarkdown(apply(partial));
          },
        });
        if (controller.current !== ctrl) return;
        const finalText = apply(text);
        setMarkdown(finalText);
        setState({ status: "done", engine });
        onCompleteRef.current?.(finalText, engine);
      } catch (err) {
        // Uma execução substituída por outra não pode mexer no estado da nova.
        if (controller.current !== ctrl) return;
        if (ctrl.signal.aborted) {
          if (restoreOnAbort) setMarkdown(base);
          setState({ status: "idle" });
          return;
        }
        // Erro: devolve o conteúdo anterior em vez de deixar um README pela metade.
        setMarkdown(base);
        const message = err instanceof Error ? err.message : "Falha ao gerar o README.";
        setState({ status: "error", error: message });
        onErrorRef.current?.(message);
      } finally {
        if (controller.current === ctrl) controller.current = null;
      }
    },
    [setMarkdown],
  );

  const generate = useCallback(
    (metadata: RepoMetadata, options: GeneratorOptions) =>
      // Parar uma geração completa mantém o texto parcial (escolha do usuário); erro restaura o rascunho.
      run(metadata, { ...options, onlySection: undefined }, (t) => t, { base: markdownRef.current, restoreOnAbort: false }),
    [run],
  );

  /** Regenera uma seção e a injeta no markdown atual, preservando o restante. */
  const regenerateSection = useCallback(
    (metadata: RepoMetadata, options: GeneratorOptions, section: SectionId) => {
      const base = markdownRef.current;
      return run(metadata, { ...options, onlySection: section }, (partial) => (partial.trim() ? replaceSection(base, section, partial) : base), {
        base,
        restoreOnAbort: true,
      });
    },
    [run],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);

  return { state, generate, regenerateSection, cancel, isStreaming: state.status === "streaming" };
}
