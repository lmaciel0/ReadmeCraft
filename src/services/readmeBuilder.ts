import { TEMPLATES } from "../lib/catalog";
import { sectionMarker } from "../lib/sections";
import { renderAsciiTree, topLevelDirs } from "../lib/tree";
import { BADGE_BUDGET } from "../prompts/badgePrompts";
import type { RepoMetadata } from "../types/github";
import type { GeneratorOptions } from "../types/readme";
import type { SectionId } from "../types/template";
import { suggestBadges } from "./badges";
import { cloneCommands, deriveCommands, type ProjectCommands } from "./commands";
import { SECTION_EMOJI, STRINGS } from "./i18n";

interface Ctx {
  meta: RepoMetadata;
  options: GeneratorOptions;
  commands: ProjectCommands;
  s: (typeof STRINGS)[keyof typeof STRINGS];
  centered: boolean;
}

const fence = (lang: string, lines: string[]) => `\`\`\`${lang}\n${lines.join("\n")}\n\`\`\``;

/** Remove caracteres que quebram labels do Mermaid. */
export function mermaidLabel(text: string): string {
  return text.replace(/["`<>;{}[\]|]/g, "").trim() || "?";
}

function heading(ctx: Ctx, id: Exclude<SectionId, "header" | "badges">): string {
  const emoji = ctx.options.includeEmoji ? SECTION_EMOJI[id] : undefined;
  return `## ${emoji ? `${emoji} ` : ""}${ctx.s.headings[id]}`;
}

function badgeLine(ctx: Ctx, categories: ("status" | "community")[]): string {
  const template = TEMPLATES[ctx.options.template];
  const budget = BADGE_BUDGET[ctx.options.template];
  const all = suggestBadges(ctx.meta, template.badgeStyle);
  const picked = categories.flatMap((cat) => all.filter((b) => b.category === cat).slice(0, budget[cat]));
  return picked.map((b) => b.markdown).join(" ");
}

function techBadges(ctx: Ctx): string[] {
  const template = TEMPLATES[ctx.options.template];
  const limit = Math.max(BADGE_BUDGET[ctx.options.template].tech, 6);
  return suggestBadges(ctx.meta, template.badgeStyle)
    .filter((b) => b.category === "tech")
    .slice(0, limit)
    .map((b) => b.markdown);
}

const builders: Record<SectionId, (ctx: Ctx) => string> = {
  header(ctx) {
    const { meta, s } = ctx;
    const tagline = meta.description ?? s.defaultTagline(meta.name);
    if (!ctx.centered) return `# ${meta.name}\n\n> ${tagline}`;
    const badges = ctx.options.sections.includes("badges") ? "" : `\n\n${badgeLine(ctx, ["status"])}`;
    return `<div align="center">\n\n# ${meta.name}\n\n**${tagline}**${badges}\n\n</div>`;
  },
  badges(ctx) {
    const line = badgeLine(ctx, ["status", "community"]);
    return ctx.centered ? `<div align="center">\n\n${line}\n\n</div>` : line;
  },
  about(ctx) {
    const { meta, s } = ctx;
    const lines = [heading(ctx, "about"), "", meta.description ?? s.aboutFallback];
    if (meta.homepage) lines.push("", `🔗 ${meta.homepage}`);
    if (meta.topics.length) lines.push("", meta.topics.map((t) => `\`${t}\``).join(" · "));
    return lines.join("\n");
  },
  features(ctx) {
    const { meta } = ctx;
    const pt = ctx.options.language === "pt-BR";
    const items: string[] = [];
    const frameworks = meta.techStack.filter((t) => t.category === "framework").map((t) => t.name);
    if (frameworks.length) items.push(pt ? `Construído com ${frameworks.join(", ")}` : `Built with ${frameworks.join(", ")}`);
    if (meta.signals.hasTests) items.push(pt ? "Suíte de testes automatizados" : "Automated test suite");
    if (meta.signals.hasCI) items.push(pt ? `Integração contínua com ${meta.signals.ciProviders.join(", ")}` : `Continuous integration with ${meta.signals.ciProviders.join(", ")}`);
    if (meta.signals.hasDocker) items.push(pt ? "Pronto para contêineres (Docker)" : "Container-ready (Docker)");
    if (meta.envVars.length) items.push(pt ? "Configuração via variáveis de ambiente" : "Configuration through environment variables");
    const lines = [heading(ctx, "features"), "", ...items.map((i) => `- ${i}`)];
    lines.push("", ctx.s.featuresTodo);
    return lines.join("\n");
  },
  techStack(ctx) {
    const badges = techBadges(ctx);
    const body = badges.length ? badges.join(" ") : "<!-- TODO -->";
    return [heading(ctx, "techStack"), "", ctx.centered ? `<div align="center">\n\n${body}\n\n</div>` : body].join("\n");
  },
  architecture(ctx) {
    const { meta } = ctx;
    const pt = ctx.options.language === "pt-BR";
    const lines = ["flowchart TD", `  user["${pt ? "Usuário" : "User"}"] --> app["${mermaidLabel(meta.name)}"]`];
    topLevelDirs(meta.tree)
      .slice(0, 7)
      .forEach((dir, i) => lines.push(`  app --> d${i}["${mermaidLabel(dir.name)}/"]`));
    meta.techStack
      .filter((t) => t.category === "database")
      .slice(0, 2)
      .forEach((t, i) => lines.push(`  app --> db${i}[("${mermaidLabel(t.name)}")]`));
    meta.techStack
      .filter((t) => t.category === "infra")
      .slice(0, 2)
      .forEach((t, i) => lines.push(`  infra${i}["${mermaidLabel(t.name)}"] -.-> app`));
    return [heading(ctx, "architecture"), "", ctx.s.architectureIntro, "", fence("mermaid", lines)].join("\n");
  },
  prerequisites(ctx) {
    const items = ctx.commands.prerequisites.length ? ctx.commands.prerequisites : ["Git"];
    return [heading(ctx, "prerequisites"), "", ...["Git", ...items.filter((i) => i !== "Git")].map((i) => `- ${i}`)].join("\n");
  },
  installation(ctx) {
    const { s, commands, meta } = ctx;
    const steps: string[] = [];
    const clone = cloneCommands(meta);
    if (clone.length) steps.push(`1. ${s.clone}\n\n${indent(fence("bash", clone))}`);
    const install = commands.install.filter((c) => !c.startsWith("cp "));
    if (install.length) steps.push(`${steps.length + 1}. ${s.install}\n\n${indent(fence("bash", install))}`);
    const envCopy = commands.install.find((c) => c.startsWith("cp "));
    if (envCopy) steps.push(`${steps.length + 1}. ${s.env}\n\n${indent(fence("bash", [envCopy]))}`);
    const run = commands.dev ?? commands.start;
    if (run) steps.push(`${steps.length + 1}. ${s.run}\n\n${indent(fence("bash", [run]))}`);
    return [heading(ctx, "installation"), "", steps.length ? steps.join("\n\n") : s.noScripts].join("\n");
  },
  usage(ctx) {
    const { commands, s } = ctx;
    const rows = (["dev", "start", "build", "test", "lint"] as const)
      .filter((k) => commands[k])
      .map((k) => `| \`${commands[k]}\` | ${s.scriptLabels[k]} |`);
    const header = ctx.options.language === "pt-BR" ? "| Comando | Descrição |" : "| Command | Description |";
    return [heading(ctx, "usage"), "", rows.length ? [header, "| --- | --- |", ...rows].join("\n") : s.noScripts].join("\n");
  },
  envVars(ctx) {
    const { meta, s } = ctx;
    if (!meta.envVars.length) return [heading(ctx, "envVars"), "", s.envDescTodo].join("\n");
    const envFile = meta.tree.find((t) => /^\.env\.(example|sample|template)$/i.test(t.path))?.path ?? ".env.example";
    return [
      heading(ctx, "envVars"),
      "",
      s.envCopy,
      "",
      fence("bash", [`cp ${envFile} .env`]),
      "",
      `| ${s.envTable.join(" | ")} |`,
      "| --- | --- | --- |",
      ...meta.envVars.map((v) => `| \`${v}\` | ${s.envDescTodo} | ${s.yes} |`),
    ].join("\n");
  },
  docker(ctx) {
    const cmds = ctx.commands.docker;
    return [heading(ctx, "docker"), "", cmds.length ? `${ctx.s.dockerIntro}\n\n${fence("bash", cmds)}` : "<!-- TODO -->"].join("\n");
  },
  tests(ctx) {
    const cmd = ctx.commands.test;
    return [heading(ctx, "tests"), "", cmd ? `${ctx.s.testsIntro}\n\n${fence("bash", [cmd])}` : ctx.s.noTests].join("\n");
  },
  projectStructure(ctx) {
    const tree = renderAsciiTree(ctx.meta.tree, { maxDepth: 2, maxChildren: 12, rootName: ctx.meta.name });
    return [heading(ctx, "projectStructure"), "", ctx.s.structureIntro, "", fence("text", tree.split("\n"))].join("\n");
  },
  roadmap(ctx) {
    const { signals } = ctx.meta;
    const items = ctx.s.roadmapItems.done({ tests: signals.hasTests, ci: signals.hasCI, docker: signals.hasDocker });
    return [heading(ctx, "roadmap"), "", ...items.map(([label, done]) => `- [${done ? "x" : " "}] ${label}`)].join("\n");
  },
  contributing(ctx) {
    const { s, meta } = ctx;
    const lines = [heading(ctx, "contributing"), ""];
    if (meta.signals.hasContributing) lines.push(s.contributingGuide, "");
    lines.push(...s.contributingSteps.map((step, i) => `${i + 1}. ${step}`));
    return lines.join("\n");
  },
  license(ctx) {
    const { meta, s } = ctx;
    return [heading(ctx, "license"), "", meta.license ? s.licenseText(meta.license.spdxId) : s.licenseTodo].join("\n");
  },
  acknowledgements(ctx) {
    const libs = ctx.meta.techStack.filter((t) => t.category !== "language" && t.category !== "infra").slice(0, 8);
    return [heading(ctx, "acknowledgements"), "", ctx.s.ackIntro, "", ...libs.map((l) => `- ${l.name}`)].join("\n");
  },
};

function indent(text: string, spaces = 3): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l) => (l ? pad + l : l))
    .join("\n");
}

/** Gera uma seção isolada (com marcador). */
export function buildSection(meta: RepoMetadata, options: GeneratorOptions, id: SectionId): string {
  const template = TEMPLATES[options.template];
  const ctx: Ctx = {
    meta,
    options,
    commands: deriveCommands(meta),
    s: STRINGS[options.language],
    centered: template.id === "showcase" || template.id === "opensource",
  };
  return `${sectionMarker(id)}\n${builders[id](ctx)}\n`;
}

/** Gera o README completo sem IA, usando apenas os metadados verificados. */
export function buildReadme(meta: RepoMetadata, options: GeneratorOptions): string {
  const ids = options.onlySection ? [options.onlySection] : options.sections;
  return ids.map((id) => buildSection(meta, options, id)).join("\n");
}
