import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, type KeyboardEvent } from "react";

export interface MarkdownEditorHandle {
  /** Insere texto na posição do cursor (substitui a seleção). */
  insert: (text: string) => void;
  /** Envolve a seleção (ou um placeholder) com `before`/`after`. */
  wrap: (before: string, after?: string, placeholder?: string) => void;
  /** Prefixa as linhas selecionadas (ex.: "## ", "- "). */
  prefixLines: (prefix: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor({ value, onChange, readOnly }, ref) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lineCount = useMemo(() => value.split("\n").length, [value]);
  const lineNumbers = useMemo(() => Array.from({ length: lineCount }, (_, i) => i + 1).join("\n"), [lineCount]);

  /** Aplica uma edição preservando o histórico de undo do navegador quando possível. */
  const applyEdit = useCallback(
    (start: number, end: number, text: string, selectStart: number, selectEnd: number) => {
      const el = textarea.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
      const ok = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
      if (!ok) onChange(el.value.slice(0, start) + text + el.value.slice(end));
      requestAnimationFrame(() => el.setSelectionRange(selectStart, selectEnd));
    },
    [onChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      insert(text) {
        const el = textarea.current;
        if (!el) return;
        const { selectionStart: s, selectionEnd: e } = el;
        applyEdit(s, e, text, s + text.length, s + text.length);
      },
      wrap(before, after = before, placeholder = "texto") {
        const el = textarea.current;
        if (!el) return;
        const { selectionStart: s, selectionEnd: e } = el;
        const selected = el.value.slice(s, e) || placeholder;
        applyEdit(s, e, before + selected + after, s + before.length, s + before.length + selected.length);
      },
      prefixLines(prefix) {
        const el = textarea.current;
        if (!el) return;
        const lineStart = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
        const end = el.selectionEnd;
        const block = el.value.slice(lineStart, end);
        const next = block
          .split("\n")
          .map((l) => prefix + l)
          .join("\n");
        applyEdit(lineStart, end, next, lineStart + next.length, lineStart + next.length);
      },
      focus: () => textarea.current?.focus(),
    }),
    [applyEdit],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const s = el.selectionStart;
      applyEdit(s, el.selectionEnd, "  ", s + 2, s + 2);
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    const wrapWith = key === "b" ? "**" : key === "i" ? "_" : key === "e" ? "`" : null;
    if (wrapWith) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end } = el;
      const sel = el.value.slice(s, end) || "texto";
      applyEdit(s, end, wrapWith + sel + wrapWith, s + wrapWith.length, s + wrapWith.length + sel.length);
    } else if (key === "k") {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end } = el;
      const sel = el.value.slice(s, end) || "link";
      const text = `[${sel}](https://)`;
      applyEdit(s, end, text, s + sel.length + 3, s + text.length - 1);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden font-mono text-[13px] leading-6">
      <div
        ref={gutter}
        aria-hidden
        className="w-12 shrink-0 overflow-hidden border-r border-line bg-surface-2/60 pt-4 pb-8 pr-2 text-right whitespace-pre text-muted/60 select-none"
      >
        {lineNumbers}
      </div>
      <textarea
        ref={textarea}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        spellCheck={false}
        wrap="off"
        aria-label="Editor Markdown do README"
        placeholder={"# Seu README aparece aqui\n\nAnalise um repositório e clique em Gerar README,\nou comece a escrever diretamente."}
        className="h-full min-h-0 w-full flex-1 resize-none overflow-auto bg-transparent px-4 py-4 text-fg outline-none placeholder:text-muted/50 focus-visible:outline-none"
      />
    </div>
  );
});
