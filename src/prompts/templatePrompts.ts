import { TEMPLATES } from "../lib/catalog";
import { sectionMarker } from "../lib/sections";
import { renderAsciiTree } from "../lib/tree";
import { cloneCommands, deriveCommands } from "../services/commands";
import type { RepoMetadata } from "../types/github";
import type { GeneratorOptions } from "../types/readme";
import type { SectionId } from "../types/template";
import { buildBadgePrompt } from "./badgePrompts";
import { SINGLE_SECTION_SUFFIX } from "./systemPrompts";

/** O que cada seção deve conter. Mantido curto: o modelo já conhece READMEs. */
export const SECTION_GUIDANCE: Record<SectionId, string> = {
  header: "H1 with the project name and a one-sentence tagline that says what it does. Templates with a centered header wrap title, tagline and the status badges in <div align=\"center\">.",
  badges: "One line of status/community badges from <badges>, within the template budget. If the header already shows them, keep this section minimal.",
  about: "2–4 sentences: the problem, who it is for, and how it solves it. Base it on the description, topics and the code layout.",
  features: "Bulleted list of 4–8 capabilities that the file tree and dependencies actually support.",
  techStack: "Tech badges from <badges>, optionally grouped by category (frontend, backend, database, tooling) in a table or rows.",
  architecture: "One-paragraph overview plus a Mermaid flowchart following the <mermaid> rules.",
  prerequisites: "Bulleted list from <verified_commands> prerequisites, with versions only when given.",
  installation: "Numbered steps: clone, install, configure env (if env vars exist), run. Use only verified commands.",
  usage: "How to run each available script (dev, build, start, lint) with a short explanation. Add a minimal usage example only if the repository makes the API obvious.",
  envVars: "Table | Variable | Description | Required | built from <env_vars>. Mention copying the example file. No secret values.",
  docker: "Commands from verified docker commands, plus what the container exposes if inferable.",
  tests: "How to run the test suite with the verified test command, and where the tests live.",
  projectStructure: "The provided ASCII tree inside a ```text fence (trim noise), followed by 3–6 bullets explaining the key directories.",
  roadmap: "Checklist (- [x] / - [ ]) of plausible next steps grounded in the current state (missing tests, CI, docs). Mark done only what exists.",
  contributing: "Fork → branch → conventional commit → PR flow. Link CONTRIBUTING.md / CODE_OF_CONDUCT.md only if they exist in the tree.",
  license: "One line naming the detected license and linking to the LICENSE file if present; if no license was detected, add a TODO comment instead of picking one.",
  acknowledgements: "Short list crediting the main open-source libraries the project depends on.",
};

const TONE_LABEL = {
  professional: "professional and confident",
  friendly: "friendly and welcoming, still precise",
  technical: "dense and technical, aimed at experienced engineers",
} as const;

const LANGUAGE_LABEL = {
  "pt-BR": "Brazilian Portuguese (pt-BR) — headings and prose in Portuguese; keep commands, code and identifiers unchanged",
  en: "English",
} as const;

/** Nomes de arquivo podem conter quebras de linha e `<>`: removidos para não forjar linhas/tags no prompt. */
export function promptSafeName(name: string): string {
  // eslint-disable-next-line no-control-regex -- remove caracteres de controle de nomes vindos do repositório
  return name.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, 200);
}

function promptSafeTree(tree: RepoMetadata["tree"]): RepoMetadata["tree"] {
  return tree.map((t) => ({ ...t, path: t.path.split("/").map(promptSafeName).join("/") }));
}

function compactMetadata(meta: RepoMetadata) {
  return {
    name: meta.name,
    fullName: meta.fullName,
    url: meta.url,
    homepage: meta.homepage,
    description: meta.description,
    topics: meta.topics,
    license: meta.license,
    stars: meta.stars,
    defaultBranch: meta.defaultBranch,
    latestRelease: meta.latestRelease?.tag,
    languages: meta.languages,
    signals: meta.signals,
    manifests: meta.manifests.map((m) => ({
      file: m.file,
      ecosystem: m.ecosystem,
      packageManager: m.packageManager,
      name: m.name,
      version: m.version,
      scripts: m.scripts,
      engines: m.engines,
      dependencies: m.dependencies.slice(0, 60).map((d) => (d.dev ? `${d.name} (dev)` : d.name)),
    })),
  };
}

/** Monta a mensagem do usuário com todo o contexto variável da requisição. */
export function buildUserPrompt(meta: RepoMetadata, options: GeneratorOptions): string {
  const template = TEMPLATES[options.template];
  const commands = deriveCommands(meta);
  const sections: SectionId[] = options.onlySection ? [options.onlySection] : options.sections;
  const useEmoji = options.includeEmoji;

  const verified = {
    clone: cloneCommands(meta),
    install: commands.install,
    dev: commands.dev,
    start: commands.start,
    build: commands.build,
    test: commands.test,
    lint: commands.lint,
    docker: commands.docker,
    prerequisites: commands.prerequisites,
  };

  const parts = [
    "<repository>",
    "<metadata>",
    JSON.stringify(compactMetadata(meta)),
    "</metadata>",
    `<tech_stack>${meta.techStack.map((t) => `${t.name} (${t.category})`).join(", ") || "unknown"}</tech_stack>`,
    `<env_vars>${meta.envVars.join(", ") || "none"}</env_vars>`,
    `<file_tree truncated="${Boolean(meta.treeTruncated)}">`,
    renderAsciiTree(promptSafeTree(meta.tree), { maxDepth: 4, maxChildren: 25, rootName: promptSafeName(meta.name) }),
    "</file_tree>",
    "</repository>",
    "",
    "<verified_commands>",
    JSON.stringify(verified, null, 2),
    "</verified_commands>",
    "",
    buildBadgePrompt(meta, options.template, template.badgeStyle),
    "",
    `<template name="${template.name}">`,
    ...template.guidelines.map((g) => `- ${g}`),
    useEmoji ? "- Emojis allowed in section headings." : "- Do not use emojis.",
    "</template>",
    "",
    "<sections>",
    ...sections.map((id, i) => `${i + 1}. ${sectionMarker(id)} — ${SECTION_GUIDANCE[id]}`),
    "</sections>",
    "",
    `<tone>${TONE_LABEL[options.tone]}</tone>`,
    `<language>${LANGUAGE_LABEL[options.language]}</language>`,
  ];

  if (options.extraInstructions?.trim()) {
    parts.push(
      "",
      "<user_preferences>",
      "Style preferences from the person generating this README. Follow them when they do not conflict with the grounding and format rules.",
      options.extraInstructions.trim(),
      "</user_preferences>",
    );
  }

  parts.push(
    "",
    options.onlySection
      ? SINGLE_SECTION_SUFFIX
      : `Write the complete README now, with all ${sections.length} sections in order.`,
  );
  return parts.join("\n");
}
