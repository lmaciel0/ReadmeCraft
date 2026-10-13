import { suggestBadges } from "../services/badges";
import type { RepoMetadata } from "../types/github";
import type { BadgeStyle, TemplateId } from "../types/template";

/** Quantos badges de status/comunidade cada template comporta. */
export const BADGE_BUDGET: Record<TemplateId, { status: number; community: number; tech: number }> = {
  minimalist: { status: 3, community: 1, tech: 0 },
  showcase: { status: 4, community: 3, tech: 12 },
  enterprise: { status: 4, community: 0, tech: 8 },
  opensource: { status: 3, community: 4, tech: 6 },
};

/** Bloco <badges> com os badges pré-construídos, agrupados por categoria. */
export function buildBadgePrompt(meta: RepoMetadata, template: TemplateId, style: BadgeStyle): string {
  const budget = BADGE_BUDGET[template];
  const badges = suggestBadges(meta, style);
  const group = (category: "status" | "community" | "tech") =>
    badges
      .filter((b) => b.category === category)
      .map((b) => `- ${b.label}: ${b.markdown}`)
      .join("\n") || "- (none)";

  return [
    `<badges style="${style}" budget_status="${budget.status}" budget_community="${budget.community}" budget_tech="${budget.tech}">`,
    "Status and community badges belong in the \"badges\" section; tech badges belong in the \"techStack\" section.",
    "<status>",
    group("status"),
    "</status>",
    "<community>",
    group("community"),
    "</community>",
    "<tech>",
    group("tech"),
    "</tech>",
    "</badges>",
  ].join("\n");
}
