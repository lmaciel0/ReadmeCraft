import { useId } from "react";
import { RotateCw, Sparkles, Wand2 } from "lucide-react";
import { SECTIONS } from "../../lib/catalog";
import { cn } from "../../lib/cn";
import type { GeneratorOptions } from "../../types/readme";
import type { SectionId } from "../../types/template";
import { Button } from "../common/Button";
import { Card } from "../common/Card";

export type EditableOptions = Omit<GeneratorOptions, "onlySection">;

interface Props {
  options: EditableOptions;
  onChange: (next: EditableOptions) => void;
  onGenerate: () => void;
  onRegenerateSection: (id: SectionId) => void;
  canGenerate: boolean;
  streaming: boolean;
  streamingSection: SectionId | null;
  /** Seções presentes no README atual (com marcador), que podem ser regeneradas. */
  presentSections: SectionId[];
  aiEnabled: boolean;
}

export function SectionManager({
  options,
  onChange,
  onGenerate,
  onRegenerateSection,
  canGenerate,
  streaming,
  streamingSection,
  presentSections,
  aiEnabled,
}: Props) {
  const toneId = useId();
  const langId = useId();
  const extraId = useId();

  const toggle = (id: SectionId) => {
    const enabled = options.sections.includes(id);
    // Mantém a ordem canônica do catálogo.
    const next = SECTIONS.map((s) => s.id).filter((sid) => (sid === id ? !enabled : options.sections.includes(sid)));
    onChange({ ...options, sections: next });
  };

  return (
    <Card title="Seções e estilo" icon={<Wand2 className="size-4" />}>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-muted" htmlFor={toneId}>
          <span>Tom de voz</span>
          <select
            id={toneId}
            value={options.tone}
            onChange={(e) => onChange({ ...options, tone: e.target.value as EditableOptions["tone"] })}
            className="h-9 w-full rounded-lg border border-line bg-surface-2 px-2 text-sm text-fg"
          >
            <option value="professional">Profissional</option>
            <option value="friendly">Amigável</option>
            <option value="technical">Técnico</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted" htmlFor={langId}>
          <span>Idioma</span>
          <select
            id={langId}
            value={options.language}
            onChange={(e) => onChange({ ...options, language: e.target.value as EditableOptions["language"] })}
            className="h-9 w-full rounded-lg border border-line bg-surface-2 px-2 text-sm text-fg"
          >
            <option value="pt-BR">Português (BR)</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>

      <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
        <span>Emojis nos títulos</span>
        <input
          type="checkbox"
          className="size-4 accent-[var(--rc-accent)]"
          checked={options.includeEmoji}
          onChange={(e) => onChange({ ...options, includeEmoji: e.target.checked })}
        />
      </label>

      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          Seções ({options.sections.length}/{SECTIONS.length})
        </legend>
        <ul className="space-y-1">
          {SECTIONS.map((section) => {
            const checked = options.sections.includes(section.id);
            const canRegen = presentSections.includes(section.id) && canGenerate && !streaming;
            const busy = streamingSection === section.id;
            return (
              <li
                key={section.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition",
                  checked ? "bg-accent-soft/60" : "hover:bg-surface-2",
                )}
              >
                <input
                  id={`sec-${section.id}`}
                  type="checkbox"
                  checked={checked}
                  disabled={section.required}
                  onChange={() => toggle(section.id)}
                  className="size-4 accent-[var(--rc-accent)]"
                />
                <label htmlFor={`sec-${section.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block truncate text-sm text-fg">{section.title}</span>
                  <span className="block truncate text-xs text-muted">{section.description}</span>
                </label>
                <button
                  type="button"
                  onClick={() => onRegenerateSection(section.id)}
                  disabled={!canRegen}
                  title={`Regenerar seção "${section.title}"`}
                  aria-label={`Regenerar seção ${section.title}`}
                  className={cn(
                    "rounded-md p-1 text-muted transition hover:bg-surface-3 hover:text-accent disabled:pointer-events-none",
                    canRegen ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100" : "opacity-0",
                    busy && "opacity-100",
                  )}
                >
                  <RotateCw className={cn("size-3.5", busy && "animate-spin text-accent")} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <label htmlFor={extraId} className="mt-4 block space-y-1 text-xs text-muted">
        <span>Instruções extras {aiEnabled ? "(opcional)" : "(usadas apenas com IA)"}</span>
        <textarea
          id={extraId}
          value={options.extraInstructions ?? ""}
          maxLength={1000}
          rows={2}
          onChange={(e) => onChange({ ...options, extraInstructions: e.target.value })}
          placeholder="Ex.: destaque a integração com Stripe; público-alvo são devs iniciantes."
          className="w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-muted/60"
        />
      </label>

      <Button
        variant="primary"
        className="mt-4 w-full"
        icon={<Sparkles className="size-4" />}
        onClick={onGenerate}
        disabled={!canGenerate}
        loading={streaming && streamingSection === null}
      >
        {streaming && streamingSection === null ? "Gerando…" : aiEnabled ? "Gerar README com IA" : "Gerar README (templates)"}
      </Button>
    </Card>
  );
}
