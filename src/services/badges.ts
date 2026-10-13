import type { RepoMetadata, TechItem } from "../types/github";
import type { BadgeStyle } from "../types/template";

const SHIELDS = "https://img.shields.io";

export type BadgeCategory = "status" | "community" | "tech";

export interface BadgeSuggestion {
  id: string;
  label: string;
  category: BadgeCategory;
  imageUrl: string;
  markdown: string;
}

/** Escapa um trecho de badge estático conforme a convenção do Shields.io. */
export function shieldsEscape(text: string): string {
  return encodeURIComponent(text.replace(/-/g, "--").replace(/_/g, "__").replace(/ /g, "_"));
}

export interface StaticBadgeInput {
  label: string;
  message?: string;
  color: string;
  logo?: string;
  logoColor?: string;
  style?: BadgeStyle;
}

export function staticBadgeUrl({ label, message, color, logo, logoColor, style = "flat" }: StaticBadgeInput): string {
  const parts = [shieldsEscape(label), message ? shieldsEscape(message) : null, encodeURIComponent(color)].filter(
    Boolean,
  );
  const params = new URLSearchParams({ style });
  if (logo) params.set("logo", logo);
  if (logoColor) params.set("logoColor", logoColor);
  return `${SHIELDS}/badge/${parts.join("-")}?${params.toString()}`;
}

export function markdownBadge(alt: string, imageUrl: string, link?: string): string {
  const safeAlt = alt.replace(/[[\]]/g, "");
  const img = `![${safeAlt}](${imageUrl})`;
  return link ? `[${img}](${link})` : img;
}

/** Cor de contraste para o logo sobre a cor de fundo do badge. */
export function logoColorFor(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return "white";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "black" : "white";
}

export function techBadge(tech: TechItem, style: BadgeStyle): BadgeSuggestion {
  const color = tech.color ?? "555555";
  const imageUrl = staticBadgeUrl({
    label: tech.name,
    color,
    logo: tech.logo,
    logoColor: tech.logo ? logoColorFor(color) : undefined,
    style,
  });
  return {
    id: `tech-${tech.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: tech.name,
    category: "tech",
    imageUrl,
    markdown: markdownBadge(tech.name, imageUrl),
  };
}

/** Badges sugeridos a partir dos metadados — só os que fazem sentido para o repositório. */
export function suggestBadges(meta: RepoMetadata, style: BadgeStyle): BadgeSuggestion[] {
  const out: BadgeSuggestion[] = [];
  const repoPath = meta.owner ? `${encodeURIComponent(meta.owner)}/${encodeURIComponent(meta.name)}` : null;
  const q = `style=${style}`;
  const push = (id: string, label: string, category: BadgeCategory, imageUrl: string, link?: string) =>
    out.push({ id, label, category, imageUrl, markdown: markdownBadge(label, imageUrl, link) });

  if (repoPath && meta.source === "github") {
    const base = `https://github.com/${repoPath}`;
    if (meta.license) push("license", "License", "status", `${SHIELDS}/github/license/${repoPath}?${q}`, `${base}/blob/${meta.defaultBranch ?? "main"}/LICENSE`);
    if (meta.latestRelease) push("release", "Release", "status", `${SHIELDS}/github/v/release/${repoPath}?${q}`, `${base}/releases`);
    const workflow = meta.tree.find((t) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(t.path));
    if (workflow) {
      const file = workflow.path.split("/").pop()!;
      push("ci", "CI", "status", `${SHIELDS}/github/actions/workflow/status/${repoPath}/${encodeURIComponent(file)}?${q}&label=CI`, `${base}/actions`);
    }
    push("last-commit", "Last commit", "status", `${SHIELDS}/github/last-commit/${repoPath}?${q}`, `${base}/commits`);
    push("stars", "Stars", "community", `${SHIELDS}/github/stars/${repoPath}?${q}`, `${base}/stargazers`);
    push("forks", "Forks", "community", `${SHIELDS}/github/forks/${repoPath}?${q}`, `${base}/network/members`);
    push("issues", "Issues", "community", `${SHIELDS}/github/issues/${repoPath}?${q}`, `${base}/issues`);
  } else if (meta.license) {
    push(
      "license",
      "License",
      "status",
      staticBadgeUrl({ label: "license", message: meta.license.spdxId, color: "blue", style }),
    );
  }

  const version = meta.manifests.find((m) => m.version)?.version;
  if (version && !meta.latestRelease) {
    push("version", "Version", "status", staticBadgeUrl({ label: "version", message: version, color: "informational", style }));
  }
  push("prs", "PRs welcome", "community", staticBadgeUrl({ label: "PRs", message: "welcome", color: "brightgreen", style }));

  for (const tech of meta.techStack) out.push(techBadge(tech, style));
  return out;
}
