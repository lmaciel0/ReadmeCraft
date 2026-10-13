import type { RefObject } from "react";
import { Bold, Code, Heading2, Image, Info, Italic, Link, List, ListChecks, Table, Workflow } from "lucide-react";
import type { MarkdownEditorHandle } from "./MarkdownEditor";

interface Props {
  editor: RefObject<MarkdownEditorHandle | null>;
  disabled?: boolean;
}

const SNIPPETS = {
  table: "\n| Coluna | Descrição |\n| --- | --- |\n| valor | texto |\n",
  mermaid: '\n```mermaid\nflowchart LR\n  A["Cliente"] --> B["API"]\n  B --> C[("Banco")]\n```\n',
  alert: "\n> [!NOTE]\n> Informação importante.\n",
  image: '\n<p align="center">\n  <img src="https://" alt="Screenshot" width="720" />\n</p>\n',
};

/** Barra de inserção rápida de componentes Markdown. */
export function Toolbar({ editor, disabled }: Props) {
  const actions = [
    { label: "Negrito (Ctrl+B)", icon: Bold, run: () => editor.current?.wrap("**") },
    { label: "Itálico (Ctrl+I)", icon: Italic, run: () => editor.current?.wrap("_") },
    { label: "Código inline (Ctrl+E)", icon: Code, run: () => editor.current?.wrap("`", "`", "código") },
    { label: "Título", icon: Heading2, run: () => editor.current?.prefixLines("## ") },
    { label: "Lista", icon: List, run: () => editor.current?.prefixLines("- ") },
    { label: "Checklist", icon: ListChecks, run: () => editor.current?.prefixLines("- [ ] ") },
    { label: "Link (Ctrl+K)", icon: Link, run: () => editor.current?.wrap("[", "](https://)", "texto") },
    { label: "Tabela", icon: Table, run: () => editor.current?.insert(SNIPPETS.table) },
    { label: "Diagrama Mermaid", icon: Workflow, run: () => editor.current?.insert(SNIPPETS.mermaid) },
    { label: "Alerta do GitHub", icon: Info, run: () => editor.current?.insert(SNIPPETS.alert) },
    { label: "Imagem centralizada", icon: Image, run: () => editor.current?.insert(SNIPPETS.image) },
  ];

  return (
    <div role="toolbar" aria-label="Formatação" className="flex items-center gap-0.5 overflow-x-auto">
      {actions.map(({ label, icon: Icon, run }) => (
        <button
          key={label}
          type="button"
          onClick={run}
          disabled={disabled}
          title={label}
          aria-label={label}
          className="rounded-md p-1.5 text-muted transition hover:bg-surface-3 hover:text-fg disabled:opacity-40"
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
