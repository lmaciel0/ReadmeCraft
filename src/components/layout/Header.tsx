import { Moon, Sun } from "lucide-react";
import type { HealthState } from "../../hooks/useHealth";
import type { Theme } from "../../hooks/useTheme";
import { TEMPLATE_LIST } from "../../lib/catalog";
import { arrowNav, rovingTabIndex } from "../../lib/a11y";
import { cn } from "../../lib/cn";
import { TEMPLATE_IDS } from "../../types/readme";
import type { TemplateId } from "../../types/template";

interface Props {
  template: TemplateId;
  onTemplateChange: (id: TemplateId) => void;
  health: HealthState;
  theme: Theme;
  onToggleTheme: () => void;
}

function StatusPill({ health }: { health: HealthState }) {
  const [dot, label, title] =
    health.status === "loading"
      ? ["bg-muted animate-pulse", "Conectando…", "Verificando a API"]
      : health.status === "offline"
        ? ["bg-danger", "API offline", "O servidor da API não respondeu. Rode `npm run dev`."]
        : health.health.ai
          ? ["bg-success", `Claude · ${health.health.model}`, "Geração com IA ativa"]
          : ["bg-warning", "Modo templates", "Sem ANTHROPIC_API_KEY no servidor: geração determinística por templates"];
  return (
    <span title={title} className="hidden items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-muted md:inline-flex" role="status">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}

export function Header({ template, onTemplateChange, health, theme, onToggleTheme }: Props) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur lg:px-6">
      <div className="flex items-center gap-2.5">
        <img src="/favicon.svg" alt="" className="size-8" />
        <div>
          <h1 className="text-base leading-tight font-bold tracking-tight">
            Readme<span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">Craft</span>
          </h1>
          <p className="text-[11px] text-muted">READMEs de alto padrão para o GitHub</p>
        </div>
      </div>

      <nav aria-label="Template" className="order-3 w-full overflow-x-auto md:order-none md:w-auto md:flex-1">
        <div
          role="radiogroup"
          aria-label="Estilo do README"
          className="inline-flex gap-1 rounded-xl border border-line bg-surface-2 p-1"
          onKeyDown={arrowNav(TEMPLATE_IDS, template, onTemplateChange)}
        >
          {TEMPLATE_LIST.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              data-value={t.id}
              aria-checked={template === t.id}
              tabIndex={rovingTabIndex(template === t.id)}
              onClick={() => onTemplateChange(t.id)}
              title={t.tagline}
              className={cn(
                "rounded-lg px-3 py-1.5 text-left text-sm whitespace-nowrap transition",
                template === t.id ? "bg-surface text-fg shadow ring-1 ring-accent/40" : "text-muted hover:text-fg",
              )}
            >
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 hidden text-xs text-muted min-[1800px]:inline">{t.tagline}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <StatusPill health={health} />
        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-lg border border-line p-2 text-muted transition hover:text-fg"
          aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </header>
  );
}
