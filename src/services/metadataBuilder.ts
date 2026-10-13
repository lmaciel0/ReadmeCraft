import type { ManifestInfo, RepoMetadata, TreeEntry } from "../types/github";
import { basename, isManifestFile, parseEnvExample, parseManifest } from "./manifestParsers";
import { detectNodePackageManager, detectSignals, detectTechStack } from "./techDetector";

/** Diretórios irrelevantes para a documentação (dependências, builds, caches). */
const IGNORED_DIRS = /(^|\/)(node_modules|vendor|dist|build|out|target|\.next|\.nuxt|\.venv|venv|__pycache__|\.git|coverage|\.idea|\.vscode)(\/|$)/;

export const MAX_TREE_ENTRIES = 5000;

export function filterTree(tree: TreeEntry[]): TreeEntry[] {
  return tree.filter((t) => !IGNORED_DIRS.test(t.path)).slice(0, MAX_TREE_ENTRIES);
}

/** Seleciona até `limit` manifestos priorizando a raiz e baixa profundidade. */
export function pickManifestPaths(tree: TreeEntry[], limit = 8): string[] {
  return tree
    .filter((t) => t.type === "file" && isManifestFile(t.path) && t.path.split("/").length <= 3)
    .filter((t) => t.size === undefined || t.size < 256_000)
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((t) => t.path);
}

export function pickEnvExamplePath(tree: TreeEntry[]): string | undefined {
  return tree.find((t) => t.type === "file" && /^\.env\.(example|sample|template)$/i.test(t.path))?.path;
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  py: "Python",
  java: "Java",
  kt: "Kotlin",
  go: "Go",
  rs: "Rust",
  php: "PHP",
  rb: "Ruby",
  cs: "C#",
  cpp: "C++",
  cc: "C++",
  c: "C",
  swift: "Swift",
  dart: "Dart",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sh: "Shell",
  vue: "Vue",
  svelte: "Svelte",
};

/** Estima percentuais de linguagem pela contagem de arquivos (modo manual). */
export function languagesFromTree(tree: TreeEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const entry of tree) {
    if (entry.type !== "file") continue;
    const ext = basename(entry.path).split(".").pop()?.toLowerCase() ?? "";
    const lang = EXTENSION_LANGUAGES[ext];
    if (!lang) continue;
    const weight = entry.size ?? 1;
    counts[lang] = (counts[lang] ?? 0) + weight;
    total += weight;
  }
  if (!total) return {};
  return Object.fromEntries(
    Object.entries(counts)
      .map(([lang, n]) => [lang, Math.round((n / total) * 1000) / 10] as const)
      .sort((a, b) => b[1] - a[1]),
  );
}

export interface BuildMetadataInput {
  source: RepoMetadata["source"];
  name: string;
  tree: TreeEntry[];
  /** Conteúdo dos arquivos relevantes (manifestos, .env.example) indexados pelo caminho. */
  files: Record<string, string>;
  languages?: Record<string, number>;
  extra?: Partial<
    Pick<
      RepoMetadata,
      | "owner"
      | "fullName"
      | "url"
      | "description"
      | "homepage"
      | "topics"
      | "license"
      | "stars"
      | "forks"
      | "openIssues"
      | "defaultBranch"
      | "latestRelease"
      | "treeTruncated"
    >
  >;
}

export function buildMetadata({ source, name, tree, files, languages, extra = {} }: BuildMetadataInput): RepoMetadata {
  const cleanTree = filterTree(tree);
  const langs = languages && Object.keys(languages).length ? languages : languagesFromTree(cleanTree);
  const primaryEcosystem = LANGUAGE_ECOSYSTEM[Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""];
  // O primeiro manifesto é tratado como "raiz": menor profundidade e, no empate,
  // o ecossistema da linguagem principal (ex.: Spring com package.json de tooling).
  const manifests = Object.entries(files)
    .filter(([path]) => isManifestFile(path))
    .map(([path, content]) => parseManifest(path, content))
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort(
      (a, b) =>
        a.file.split("/").length - b.file.split("/").length ||
        Number(b.ecosystem === primaryEcosystem) - Number(a.ecosystem === primaryEcosystem),
    );

  const nodePm = detectNodePackageManager(cleanTree);
  for (const m of manifests) {
    if (m.ecosystem === "node" && nodePm && !m.file.includes("/")) m.packageManager = nodePm;
  }

  const envPath = Object.keys(files).find((p) => /(^|\/)\.env\.(example|sample|template)$/i.test(p));
  const rootManifest = manifests[0];
  const licenseFromManifest = manifests.find((m) => m.license)?.license;

  return clampMetadata({
    source,
    name,
    topics: [],
    languages: langs,
    tree: cleanTree,
    manifests,
    techStack: detectTechStack(langs, manifests, cleanTree),
    signals: detectSignals(cleanTree),
    envVars: envPath ? parseEnvExample(files[envPath]!) : [],
    description: rootManifest?.description,
    license: licenseFromManifest ? { spdxId: licenseFromManifest, name: licenseFromManifest } : undefined,
    ...stripUndefined(extra),
  });
}

const LANGUAGE_ECOSYSTEM: Record<string, ManifestInfo["ecosystem"]> = {
  TypeScript: "node",
  JavaScript: "node",
  Vue: "node",
  Svelte: "node",
  Python: "python",
  "Jupyter Notebook": "python",
  Java: "java",
  Kotlin: "java",
  Rust: "rust",
  Go: "go",
  PHP: "php",
  Blade: "php",
  Ruby: "ruby",
};

const cut = (s: string | undefined, n: number) => (s === undefined ? undefined : s.slice(0, n));

/**
 * Ajusta os metadados aos limites do schema do backend (src/types/schemas.ts),
 * para que tudo que o analisador produz seja aceito pela rota de geração.
 */
export function clampMetadata(meta: RepoMetadata): RepoMetadata {
  return {
    ...meta,
    name: meta.name.slice(0, 200),
    description: cut(meta.description, 2000),
    topics: meta.topics.slice(0, 30).map((t) => t.slice(0, 60)),
    license: meta.license ? { spdxId: meta.license.spdxId.slice(0, 60), name: meta.license.name.slice(0, 200) } : undefined,
    languages: Object.fromEntries(Object.entries(meta.languages).slice(0, 60)),
    tree: meta.tree.slice(0, MAX_TREE_ENTRIES).filter((t) => t.path.length <= 500),
    envVars: meta.envVars.slice(0, 100).map((v) => v.slice(0, 120)),
    techStack: meta.techStack.slice(0, 80),
    manifests: meta.manifests.slice(0, 20).map((m) => ({
      ...m,
      file: m.file.slice(0, 300),
      name: cut(m.name, 300),
      version: cut(m.version, 100),
      description: cut(m.description, 2000),
      license: cut(m.license, 100),
      dependencies: m.dependencies.slice(0, 500).map((d) => ({ ...d, name: d.name.slice(0, 200), version: cut(d.version, 100) })),
      scripts: Object.fromEntries(Object.entries(m.scripts).slice(0, 50).map(([k, v]) => [k.slice(0, 100), v.slice(0, 500)])),
      engines: m.engines
        ? Object.fromEntries(Object.entries(m.engines).slice(0, 20).map(([k, v]) => [k.slice(0, 100), v.slice(0, 100)]))
        : undefined,
    })),
  };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

/**
 * Converte uma árvore colada em texto (saída de `tree`, `find` ou lista de caminhos)
 * em entradas normalizadas. Diretórios são inferidos dos prefixos.
 */
export function parseTreeText(text: string): TreeEntry[] {
  const files = new Set<string>();
  const dirs = new Set<string>();
  const stack: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || /^\d+ director(y|ies)/.test(raw.trim())) continue;
    // Formato `tree`: prefixos "│   ", "├── ", "└── ".
    const treeMatch = /^((?:[│|]\s{3}|\s{4})*)(?:[├└|`][─-]{2}\s?)(.+)$/.exec(raw);
    let path: string;
    let isDir: boolean;
    if (treeMatch) {
      const depth = treeMatch[1]!.length / 4;
      const name = treeMatch[2]!.trim();
      isDir = name.endsWith("/");
      const clean = name.replace(/\/$/, "");
      stack.length = depth;
      stack[depth] = clean;
      path = stack.slice(0, depth + 1).join("/");
    } else {
      path = raw.trim().replace(/^\.\//, "");
      isDir = path.endsWith("/");
      path = path.replace(/\/$/, "");
      if (!path || path === ".") continue;
    }
    if (isDir) dirs.add(path);
    else files.add(path);
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }

  // Entradas de `tree` sem barra que viraram prefixos de outras são diretórios.
  for (const d of dirs) files.delete(d);
  return [
    ...[...dirs].sort().map((path) => ({ path, type: "dir" as const })),
    ...[...files].sort().map((path) => ({ path, type: "file" as const })),
  ];
}
