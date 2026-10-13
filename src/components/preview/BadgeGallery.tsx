import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { suggestBadges, type BadgeCategory } from "../../services/badges";
import type { RepoMetadata } from "../../types/github";
import type { BadgeStyle } from "../../types/template";
import { arrowNav, rovingTabIndex } from "../../lib/a11y";
import { cn } from "../../lib/cn";

interface Props {
  metadata: RepoMetadata | null;
  onInsert: (markdown: string) => void;
}

const STYLES: readonly BadgeStyle[] = ["flat", "flat-square", "for-the-badge", "plastic"];
const CATEGORY_LABEL: Record<BadgeCategory, string> = { status: "Status", community: "Comunidade", tech: "Tecnologias" };

export function BadgeGallery({ metadata, onInsert }: Props) {
  const [style, setStyle] = useState<BadgeStyle>("for-the-badge");
  const badges = useMemo(() => (metadata ? suggestBadges(metadata, style) : []), [metadata, style]);

  if (!metadata) {
    return <p className="text-sm text-muted">Analise um repositório para ver os badges sugeridos.</p>;
  }

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Estilo dos badges" className="flex flex-wrap gap-2" onKeyDown={arrowNav(STYLES, style, setStyle)}>
        {STYLES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            data-value={s}
            aria-checked={style === s}
            tabIndex={rovingTabIndex(style === s)}
            onClick={() => setStyle(s)}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-xs transition",
              style === s ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {(["status", "community", "tech"] as const).map((cat) => {
        const items = badges.filter((b) => b.category === cat);
        if (!items.length) return null;
        return (
          <section key={cat}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{CATEGORY_LABEL[cat]}</h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onInsert(b.markdown)}
                    className="group flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-left transition hover:border-accent"
                    title={b.markdown}
                  >
                    <img src={b.imageUrl} alt={b.label} className="h-5 max-w-[75%] object-contain" referrerPolicy="no-referrer" loading="lazy" />
                    <span className="flex items-center gap-1 text-xs text-muted group-hover:text-accent">
                      <Plus className="size-3.5" aria-hidden /> Inserir
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
