/** Identifica um repositório público no GitHub. */
export interface RepoRef {
  owner: string;
  repo: string;
}

export type Ecosystem =
  | "node"
  | "python"
  | "java"
  | "rust"
  | "go"
  | "php"
  | "ruby"
  | "dotnet"
  | "unknown";

export type PackageManager =
  | "npm"
  | "yarn"
  | "pnpm"
  | "bun"
  | "pip"
  | "poetry"
  | "uv"
  | "maven"
  | "gradle"
  | "cargo"
  | "go"
  | "composer"
  | "bundler";

export interface Dependency {
  name: string;
  version?: string;
  dev?: boolean;
}

/** Resultado da leitura de um arquivo de manifesto (package.json, requirements.txt, ...). */
export interface ManifestInfo {
  file: string;
  ecosystem: Ecosystem;
  packageManager?: PackageManager;
  name?: string;
  version?: string;
  description?: string;
  license?: string;
  dependencies: Dependency[];
  /** Scripts declarados (ex.: `npm run dev`). Só comandos que existem de fato. */
  scripts: Record<string, string>;
  engines?: Record<string, string>;
}

export type TechCategory =
  | "language"
  | "framework"
  | "library"
  | "database"
  | "tooling"
  | "testing"
  | "infra";

export interface TechItem {
  name: string;
  category: TechCategory;
  /** Slug do Simple Icons usado nos badges do Shields.io. */
  logo?: string;
  /** Cor hexadecimal (sem #) para o badge. */
  color?: string;
}

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
}

/** Metadados consolidados que alimentam o prompt / gerador. */
export interface RepoMetadata {
  source: "github" | "manual";
  name: string;
  owner?: string;
  fullName?: string;
  url?: string;
  description?: string;
  homepage?: string;
  topics: string[];
  license?: { spdxId: string; name: string };
  stars?: number;
  forks?: number;
  openIssues?: number;
  defaultBranch?: string;
  latestRelease?: { tag: string; name?: string; url?: string };
  /** Linguagens com percentual (0-100). */
  languages: Record<string, number>;
  tree: TreeEntry[];
  treeTruncated?: boolean;
  manifests: ManifestInfo[];
  techStack: TechItem[];
  /** Sinais estruturais detectados na árvore. */
  signals: RepoSignals;
  /** Nomes de variáveis encontradas em `.env.example` (nunca valores). */
  envVars: string[];
}

export interface RepoSignals {
  hasDocker: boolean;
  hasDockerCompose: boolean;
  hasCI: boolean;
  ciProviders: string[];
  hasTests: boolean;
  hasLicenseFile: boolean;
  hasContributing: boolean;
  hasCodeOfConduct: boolean;
  hasEnvExample: boolean;
  hasChangelog: boolean;
  isMonorepo: boolean;
}
