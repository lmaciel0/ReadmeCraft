import { useId, useMemo, useState } from "react";
import { Download, ImagePlus } from "lucide-react";
import { arrowNav, rovingTabIndex } from "../../lib/a11y";
import { TEMPLATE_LIST } from "../../lib/catalog";
import { cn } from "../../lib/cn";
import { downloadFile } from "../../lib/download";
import { BANNER_PATH, buildBannerSvg, svgDataUrl } from "../../services/bannerGenerator";
import type { RepoMetadata } from "../../types/github";
import { TEMPLATE_IDS } from "../../types/readme";
import type { TemplateId } from "../../types/template";
import { Button } from "../common/Button";

interface Props {
  metadata: RepoMetadata | null;
  defaultVariant: TemplateId;
  /** Recebe o SVG gerado para inserir o banner no README. */
  onInsert: (svg: string, alt: string) => void;
}

export function BannerStudio({ metadata, defaultVariant, onInsert }: Props) {
  const [variant, setVariant] = useState<TemplateId>(defaultVariant);
  const [title, setTitle] = useState(metadata?.name ?? "");
  const [tagline, setTagline] = useState(metadata?.description ?? "");
  const allTechs = useMemo(() => (metadata?.techStack ?? []).map((t) => t.name), [metadata]);
  const [techs, setTechs] = useState<string[]>(() => allTechs.slice(0, 5));
  const ids = { title: useId(), tagline: useId() };

  const svg = useMemo(() => buildBannerSvg({ title, tagline, techs, variant }), [title, tagline, techs, variant]);
  const input = "h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-muted/60";

  return (
    <div className="space-y-4">
      <img src={svgDataUrl(svg)} alt="Pré-visualização do banner" className="w-full rounded-lg border border-line" />

      <div role="radiogroup" aria-label="Estilo do banner" className="flex flex-wrap gap-2" onKeyDown={arrowNav(TEMPLATE_IDS, variant, setVariant)}>
        {TEMPLATE_LIST.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            data-value={t.id}
            aria-checked={variant === t.id}
            tabIndex={rovingTabIndex(variant === t.id)}
            onClick={() => setVariant(t.id)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs transition",
              variant === t.id ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg",
            )}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={ids.title} className="space-y-1 text-xs text-muted">
          <span>Título</span>
          <input id={ids.title} value={title} maxLength={32} onChange={(e) => setTitle(e.target.value)} className={input} />
        </label>
        <label htmlFor={ids.tagline} className="space-y-1 text-xs text-muted">
          <span>Tagline</span>
          <input id={ids.tagline} value={tagline} maxLength={90} onChange={(e) => setTagline(e.target.value)} className={input} />
        </label>
      </div>

      {allTechs.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-xs text-muted">Tecnologias no banner (até 6)</legend>
          <div className="flex flex-wrap gap-1.5">
            {allTechs.map((name) => {
              const on = techs.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && techs.length >= 6}
                  onClick={() => setTechs((ts) => (on ? ts.filter((t) => t !== name) : [...ts, name]))}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-xs transition disabled:opacity-40",
                    on ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg",
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <p className="text-xs text-muted">
        Salve o arquivo em <code className="font-mono">{BANNER_PATH.slice(2)}</code> no seu repositório. O preview já mostra o banner.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button icon={<Download className="size-4" />} onClick={() => downloadFile(svg, "banner.svg", "image/svg+xml")}>
          Baixar banner.svg
        </Button>
        <Button variant="primary" icon={<ImagePlus className="size-4" />} onClick={() => onInsert(svg, title || "Banner")}>
          Inserir no README
        </Button>
      </div>
    </div>
  );
}
