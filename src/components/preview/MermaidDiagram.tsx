import { memo, useEffect, useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Theme } from "../../hooks/useTheme";

type MermaidApi = typeof import("mermaid").default;
let mermaidPromise: Promise<MermaidApi> | null = null;

/** Carrega o Mermaid sob demanda (bundle pesado fica fora do carregamento inicial). */
function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

interface Props {
  code: string;
  theme: Theme;
  /** Durante o streaming o diagrama ainda está incompleto: espera mais antes de renderizar. */
  debounceMs?: number;
}

type RenderState = { status: "loading" } | { status: "ok"; svg: string } | { status: "error"; message: string };

function MermaidDiagramImpl({ code, theme, debounceMs = 250 }: Props) {
  const reactId = useId();
  const [state, setState] = useState<RenderState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          // "strict": sanitiza labels, desabilita click/callbacks e HTML nos nós.
          securityLevel: "strict",
          theme: theme === "dark" ? "dark" : "default",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        });
        const id = `mmd-${reactId.replace(/[^a-zA-Z0-9]/g, "")}-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) setState({ status: "ok", svg });
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: err instanceof Error ? err.message.split("\n")[0]! : "Diagrama inválido" });
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, theme, debounceMs, reactId]);

  if (state.status === "ok") {
    // SVG produzido pelo Mermaid em modo strict (sanitizado internamente com DOMPurify).
    return <div className="mermaid-diagram my-4 flex justify-center" role="img" aria-label="Diagrama Mermaid" dangerouslySetInnerHTML={{ __html: state.svg }} />;
  }
  return (
    <div className="my-4">
      {state.status === "error" && (
        <p className="mb-2 flex items-center gap-2 text-xs text-warning">
          <AlertTriangle className="size-3.5" aria-hidden /> Mermaid: {state.message}
        </p>
      )}
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const MermaidDiagram = memo(MermaidDiagramImpl);
