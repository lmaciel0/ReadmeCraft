import { Check, CircleDot, GitFork, Layers, Minus, Star, Tag } from "lucide-react";
import type { RepoMetadata } from "../../types/github";
import { Card } from "../common/Card";

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Java: "#b07219",
  Kotlin: "#A97BFF",
  Go: "#00ADD8",
  Rust: "#dea584",
  PHP: "#4F5D95",
  Ruby: "#701516",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  HTML: "#e34c26",
  CSS: "#663399",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Dart: "#00B4AB",
  Swift: "#F05138",
};

const fmt = new Intl.NumberFormat("pt-BR", { notation: "compact" });

export function TechStackDetector({ metadata }: { metadata: RepoMetadata }) {
  const langs = Object.entries(metadata.languages).filter(([, pct]) => pct > 0);
  const signals: [string, boolean][] = [
    ["Testes", metadata.signals.hasTests],
    [metadata.signals.ciProviders[0] ?? "CI", metadata.signals.hasCI],
    ["Docker", metadata.signals.hasDocker || metadata.signals.hasDockerCompose],
    [".env.example", metadata.signals.hasEnvExample],
    ["Licença", Boolean(metadata.license) || metadata.signals.hasLicenseFile],
    ["CONTRIBUTING", metadata.signals.hasContributing],
  ];

  return (
    <Card title="Análise" icon={<Layers className="size-4" />} aria-live="polite">
      <div className="mb-3">
        <p className="truncate font-mono text-sm font-semibold text-fg" title={metadata.fullName ?? metadata.name}>
          {metadata.fullName ?? metadata.name}
        </p>
        {metadata.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{metadata.description}</p>}
        {metadata.source === "github" && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <Star className="size-3.5" aria-hidden /> {fmt.format(metadata.stars ?? 0)}
            </span>
            <span className="flex items-center gap-1">
              <GitFork className="size-3.5" aria-hidden /> {fmt.format(metadata.forks ?? 0)}
            </span>
            {metadata.latestRelease && (
              <span className="flex items-center gap-1">
                <Tag className="size-3.5" aria-hidden /> {metadata.latestRelease.tag}
              </span>
            )}
            {metadata.license && <span>{metadata.license.spdxId}</span>}
          </div>
        )}
      </div>

      {langs.length > 0 && (
        <div className="mb-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`Linguagens: ${langs.map(([l, p]) => `${l} ${p}%`).join(", ")}`}>
            {langs.map(([lang, pct]) => (
              <span key={lang} style={{ width: `${pct}%`, background: LANG_COLORS[lang] ?? "#8b949e" }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {langs.slice(0, 6).map(([lang, pct]) => (
              <li key={lang} className="flex items-center gap-1">
                <CircleDot className="size-3" style={{ color: LANG_COLORS[lang] ?? "#8b949e" }} aria-hidden />
                {lang} <span className="text-muted/70">{pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {metadata.techStack.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-1.5" aria-label="Tecnologias detectadas">
          {metadata.techStack.map((t) => (
            <li
              key={t.name}
              className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs text-fg"
              style={{ borderLeftColor: t.color ? `#${t.color}` : undefined, borderLeftWidth: 3 }}
            >
              {t.name}
            </li>
          ))}
        </ul>
      )}

      <ul className="grid grid-cols-2 gap-1 text-xs">
        {signals.map(([label, ok]) => (
          <li key={label} className={ok ? "flex items-center gap-1.5 text-fg" : "flex items-center gap-1.5 text-muted/60"}>
            {ok ? <Check className="size-3.5 text-success" aria-label="presente" /> : <Minus className="size-3.5" aria-label="ausente" />}
            {label}
          </li>
        ))}
      </ul>

      {metadata.manifests.length > 0 && (
        <p className="mt-3 truncate text-xs text-muted" title={metadata.manifests.map((m) => m.file).join(", ")}>
          Manifestos: <span className="font-mono">{metadata.manifests.map((m) => m.file).join(", ")}</span>
        </p>
      )}
    </Card>
  );
}
