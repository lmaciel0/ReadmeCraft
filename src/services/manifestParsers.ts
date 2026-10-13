import type { Dependency, ManifestInfo } from "../types/github";

/** Arquivos de manifesto reconhecidos (comparação pelo nome base, case-insensitive). */
export const MANIFEST_FILES = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "cargo.toml",
  "go.mod",
  "composer.json",
  "gemfile",
] as const;

export function isManifestFile(path: string): boolean {
  const base = basename(path).toLowerCase();
  return (MANIFEST_FILES as readonly string[]).includes(base);
}

export function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Faz o parse de um manifesto pelo nome do arquivo.
 * Retorna `null` quando o arquivo não é suportado ou está malformado — nunca lança.
 */
export function parseManifest(path: string, content: string): ManifestInfo | null {
  const base = basename(path).toLowerCase();
  try {
    switch (base) {
      case "package.json":
        return parsePackageJson(content, path);
      case "requirements.txt":
        return parseRequirementsTxt(content, path);
      case "pyproject.toml":
        return parsePyprojectToml(content, path);
      case "pom.xml":
        return parsePomXml(content, path);
      case "build.gradle":
      case "build.gradle.kts":
        return parseGradle(content, path);
      case "cargo.toml":
        return parseCargoToml(content, path);
      case "go.mod":
        return parseGoMod(content, path);
      case "composer.json":
        return parseComposerJson(content, path);
      case "gemfile":
        return parseGemfile(content, path);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Node

interface PackageJson {
  name?: unknown;
  version?: unknown;
  description?: unknown;
  license?: unknown;
  scripts?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  engines?: unknown;
  packageManager?: unknown;
}

export function parsePackageJson(content: string, file = "package.json"): ManifestInfo {
  const pkg = JSON.parse(content) as PackageJson;
  if (typeof pkg !== "object" || pkg === null || Array.isArray(pkg)) {
    throw new Error("package.json inválido");
  }
  const pm = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : undefined;
  return {
    file,
    ecosystem: "node",
    packageManager: pm === "yarn" || pm === "pnpm" || pm === "bun" ? pm : "npm",
    name: str(pkg.name),
    version: str(pkg.version),
    description: str(pkg.description),
    license: str(pkg.license),
    dependencies: [...recordToDeps(pkg.dependencies, false), ...recordToDeps(pkg.devDependencies, true)],
    scripts: stringRecord(pkg.scripts),
    engines: stringRecord(pkg.engines),
  };
}

// ---------------------------------------------------------------- Python

export function parseRequirementsTxt(content: string, file = "requirements.txt"): ManifestInfo {
  const dependencies: Dependency[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    const dep = parsePep508(line);
    if (dep) dependencies.push(dep);
  }
  return { file, ecosystem: "python", packageManager: "pip", dependencies, scripts: {} };
}

/** Converte `requests[socks]>=2.31; python_version>"3.8"` em `{ name, version }`. */
export function parsePep508(spec: string): Dependency | null {
  const withoutMarker = spec.split(";")[0]!.trim();
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(.*)$/.exec(withoutMarker);
  if (!match) return null;
  const version = match[3]?.trim();
  return { name: match[1]!, ...(version ? { version } : {}) };
}

export function parsePyprojectToml(content: string, file = "pyproject.toml"): ManifestInfo {
  const toml = parseTomlSections(content);
  const project = toml.get("project");
  const poetry = toml.get("tool.poetry");
  const dependencies: Dependency[] = [];

  if (project?.has("dependencies")) {
    for (const spec of tomlStringArray(project.get("dependencies")!)) {
      const dep = parsePep508(spec);
      if (dep) dependencies.push(dep);
    }
  }
  for (const [section, dev] of [
    ["tool.poetry.dependencies", false],
    ["tool.poetry.dev-dependencies", true],
    ["tool.poetry.group.dev.dependencies", true],
  ] as const) {
    for (const [name, raw] of toml.get(section) ?? []) {
      if (name.toLowerCase() === "python") continue;
      dependencies.push({ name, version: tomlVersion(raw), dev });
    }
  }

  const scripts: Record<string, string> = {};
  for (const [name, raw] of toml.get("project.scripts") ?? toml.get("tool.poetry.scripts") ?? []) {
    scripts[name] = tomlString(raw) ?? raw;
  }

  const meta = project ?? poetry;
  const usesUv = toml.has("tool.uv");
  return {
    file,
    ecosystem: "python",
    packageManager: poetry ? "poetry" : usesUv ? "uv" : "pip",
    name: tomlString(meta?.get("name")),
    version: tomlString(meta?.get("version")),
    description: tomlString(meta?.get("description")),
    license: tomlString(meta?.get("license")) ?? tomlInlineField(meta?.get("license"), "text"),
    dependencies,
    scripts,
    engines: tomlString(project?.get("requires-python"))
      ? { python: tomlString(project?.get("requires-python"))! }
      : undefined,
  };
}

// ---------------------------------------------------------------- Java

export function parsePomXml(content: string, file = "pom.xml"): ManifestInfo {
  const noComments = content.replace(/<!--[\s\S]*?-->/g, "");
  const depsBlock = /<dependencies>([\s\S]*?)<\/dependencies>/.exec(
    noComments.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, ""),
  )?.[1];
  // Metadados do projeto: remove blocos aninhados que também têm artifactId/version.
  const top = noComments
    .replace(/<parent>[\s\S]*?<\/parent>/g, "")
    .replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, "")
    .replace(/<dependencies>[\s\S]*?<\/dependencies>/g, "")
    .replace(/<build>[\s\S]*?<\/build>/g, "")
    .replace(/<profiles>[\s\S]*?<\/profiles>/g, "")
    .replace(/<licenses>[\s\S]*?<\/licenses>/g, "");

  const dependencies: Dependency[] = [];
  for (const block of depsBlock?.match(/<dependency>[\s\S]*?<\/dependency>/g) ?? []) {
    const groupId = xmlTag(block, "groupId");
    const artifactId = xmlTag(block, "artifactId");
    if (!artifactId) continue;
    dependencies.push({
      name: groupId ? `${groupId}:${artifactId}` : artifactId,
      version: xmlTag(block, "version"),
      dev: xmlTag(block, "scope") === "test",
    });
  }

  const javaVersion =
    xmlTag(noComments, "java.version") ??
    xmlTag(noComments, "maven.compiler.release") ??
    xmlTag(noComments, "maven.compiler.source");

  return {
    file,
    ecosystem: "java",
    packageManager: "maven",
    name: xmlTag(top, "name") ?? xmlTag(top, "artifactId"),
    version: xmlTag(top, "version"),
    description: xmlTag(top, "description"),
    license: xmlTag(/<licenses>([\s\S]*?)<\/licenses>/.exec(noComments)?.[1] ?? "", "name"),
    dependencies,
    scripts: {},
    engines: javaVersion ? { java: javaVersion } : undefined,
  };
}

export function parseGradle(content: string, file = "build.gradle"): ManifestInfo {
  const dependencies: Dependency[] = [];
  const re =
    /\b(implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|kapt|ksp)\s*\(?\s*["']([^"':]+):([^"':]+)(?::([^"']+))?["']/g;
  for (const m of content.matchAll(re)) {
    dependencies.push({
      name: `${m[2]}:${m[3]}`,
      version: m[4],
      dev: m[1]!.startsWith("test"),
    });
  }
  return { file, ecosystem: "java", packageManager: "gradle", dependencies, scripts: {} };
}

// ---------------------------------------------------------------- Rust / Go / PHP / Ruby

export function parseCargoToml(content: string, file = "Cargo.toml"): ManifestInfo {
  const toml = parseTomlSections(content);
  const pkg = toml.get("package");
  const dependencies: Dependency[] = [];
  for (const [section, dev] of [
    ["dependencies", false],
    ["dev-dependencies", true],
  ] as const) {
    for (const [name, raw] of toml.get(section) ?? []) {
      dependencies.push({ name, version: tomlVersion(raw), dev });
    }
  }
  return {
    file,
    ecosystem: "rust",
    packageManager: "cargo",
    name: tomlString(pkg?.get("name")),
    version: tomlString(pkg?.get("version")),
    description: tomlString(pkg?.get("description")),
    license: tomlString(pkg?.get("license")),
    dependencies,
    scripts: {},
    engines: tomlString(pkg?.get("rust-version")) ? { rust: tomlString(pkg?.get("rust-version"))! } : undefined,
  };
}

export function parseGoMod(content: string, file = "go.mod"): ManifestInfo {
  const module = /^module\s+(\S+)/m.exec(content)?.[1];
  const goVersion = /^go\s+(\S+)/m.exec(content)?.[1];
  const dependencies: Dependency[] = [];
  const pushReq = (line: string) => {
    const m = /^\s*(\S+)\s+(v\S+)(\s*\/\/\s*indirect)?/.exec(line);
    if (m && !m[3]) dependencies.push({ name: m[1]!, version: m[2]! });
  };
  for (const block of content.matchAll(/^require\s*\(([\s\S]*?)^\)/gm)) {
    block[1]!.split(/\r?\n/).forEach(pushReq);
  }
  for (const single of content.matchAll(/^require\s+([^(\s].*)$/gm)) pushReq(single[1]!);

  return {
    file,
    ecosystem: "go",
    packageManager: "go",
    name: module?.replace(/\/v\d+$/, "").split("/").pop(),
    dependencies,
    scripts: {},
    engines: goVersion ? { go: goVersion } : undefined,
  };
}

export function parseComposerJson(content: string, file = "composer.json"): ManifestInfo {
  const json = JSON.parse(content) as Record<string, unknown>;
  const deps = [...recordToDeps(json.require, false), ...recordToDeps(json["require-dev"], true)].filter(
    (d) => d.name !== "php" && !d.name.startsWith("ext-"),
  );
  const require = stringRecord(json.require);
  return {
    file,
    ecosystem: "php",
    packageManager: "composer",
    name: str(json.name),
    version: str(json.version),
    description: str(json.description),
    license: Array.isArray(json.license) ? str(json.license[0]) : str(json.license),
    dependencies: deps,
    scripts: Object.fromEntries(
      Object.entries((json.scripts as Record<string, unknown> | undefined) ?? {}).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.join(" && ") : String(v),
      ]),
    ),
    engines: require.php ? { php: require.php } : undefined,
  };
}

export function parseGemfile(content: string, file = "Gemfile"): ManifestInfo {
  const dependencies: Dependency[] = [];
  for (const m of content.matchAll(/^\s*gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/gm)) {
    dependencies.push({ name: m[1]!, ...(m[2] ? { version: m[2] } : {}) });
  }
  const ruby = /^\s*ruby\s+["']([^"']+)["']/m.exec(content)?.[1];
  return {
    file,
    ecosystem: "ruby",
    packageManager: "bundler",
    dependencies,
    scripts: {},
    engines: ruby ? { ruby } : undefined,
  };
}

// ---------------------------------------------------------------- .env.example

/** Extrai apenas NOMES de variáveis de um `.env.example` (valores são descartados). */
export function parseEnvExample(content: string): string[] {
  const names = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m) names.add(m[1]!);
  }
  return [...names];
}

// ---------------------------------------------------------------- helpers

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}

function recordToDeps(value: unknown, dev: boolean): Dependency[] {
  return Object.entries(stringRecord(value)).map(([name, version]) => ({ name, version, dev }));
}

function xmlTag(xml: string, tag: string): string | undefined {
  const escaped = tag.replace(/\./g, "\\.");
  return str(new RegExp(`<${escaped}>\\s*([^<]*?)\\s*</${escaped}>`).exec(xml)?.[1]);
}

/**
 * Parser TOML mínimo: suficiente para manifestos (seções, chaves, strings, arrays
 * multilinha e inline tables). Valores são mantidos crus para conversão sob demanda.
 */
export function parseTomlSections(content: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>([["", new Map()]]);
  let current = sections.get("")!;
  let pendingKey: string | null = null;
  let pendingValue = "";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (pendingKey) {
      pendingValue += ` ${line}`;
      if (bracketBalance(pendingValue) <= 0) {
        current.set(pendingKey, pendingValue.trim());
        pendingKey = null;
      }
      continue;
    }
    if (!line) continue;
    const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
    if (header) {
      const name = header[1]!.replace(/["']/g, "");
      current = sections.get(name) ?? new Map();
      sections.set(name, current);
      continue;
    }
    const kv = /^("?[^"=]+"?|'[^']+')\s*=\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!.trim().replace(/^["']|["']$/g, "");
    const value = kv[2]!.trim();
    if (bracketBalance(value) > 0) {
      pendingKey = key;
      pendingValue = value;
    } else {
      current.set(key, value);
    }
  }
  return sections;
}

function stripTomlComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote && line[i - 1] !== "\\") quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

function bracketBalance(value: string): number {
  let depth = 0;
  for (const ch of value.replace(/"[^"]*"|'[^']*'/g, "")) {
    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;
  }
  return depth;
}

export function tomlString(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = /^"((?:[^"\\]|\\.)*)"$|^'([^']*)'$/.exec(raw.trim());
  return m ? str(m[1] ?? m[2]) : undefined;
}

function tomlStringArray(raw: string): string[] {
  return [...raw.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((m) => (m[1] ?? m[2])!);
}

function tomlInlineField(raw: string | undefined, field: string): string | undefined {
  if (!raw) return undefined;
  return str(new RegExp(`${field}\\s*=\\s*["']([^"']+)["']`).exec(raw)?.[1]);
}

function tomlVersion(raw: string): string | undefined {
  return tomlString(raw) ?? tomlInlineField(raw, "version");
}
