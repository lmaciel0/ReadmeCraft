import type { ManifestInfo, RepoSignals, TechItem, TreeEntry } from "../types/github";
import { basename } from "./manifestParsers";

type TechDef = Omit<TechItem, "name"> & { name: string };

/** Linguagens (nome do GitHub Linguist) → badge. */
const LANGUAGES: Record<string, Omit<TechDef, "category">> = {
  TypeScript: { name: "TypeScript", logo: "typescript", color: "3178C6" },
  JavaScript: { name: "JavaScript", logo: "javascript", color: "F7DF1E" },
  Python: { name: "Python", logo: "python", color: "3776AB" },
  Java: { name: "Java", logo: "openjdk", color: "ED8B00" },
  Kotlin: { name: "Kotlin", logo: "kotlin", color: "7F52FF" },
  Go: { name: "Go", logo: "go", color: "00ADD8" },
  Rust: { name: "Rust", logo: "rust", color: "000000" },
  PHP: { name: "PHP", logo: "php", color: "777BB4" },
  Ruby: { name: "Ruby", logo: "ruby", color: "CC342D" },
  "C#": { name: "C#", logo: "dotnet", color: "512BD4" },
  "C++": { name: "C++", logo: "cplusplus", color: "00599C" },
  C: { name: "C", logo: "c", color: "A8B9CC" },
  Swift: { name: "Swift", logo: "swift", color: "F05138" },
  Dart: { name: "Dart", logo: "dart", color: "0175C2" },
  HTML: { name: "HTML5", logo: "html5", color: "E34F26" },
  CSS: { name: "CSS3", logo: "css", color: "663399" },
  SCSS: { name: "Sass", logo: "sass", color: "CC6699" },
  Shell: { name: "Shell", logo: "gnubash", color: "4EAA25" },
  Vue: { name: "Vue.js", logo: "vuedotjs", color: "4FC08D" },
  Svelte: { name: "Svelte", logo: "svelte", color: "FF3E00" },
};

/**
 * Dependências conhecidas → tecnologia. A chave é comparada com o nome exato
 * ou com prefixo `@scope/` (ex.: `@nestjs/core` casa com `@nestjs/`).
 */
const DEPENDENCIES: Record<string, TechDef> = {
  react: { name: "React", category: "framework", logo: "react", color: "61DAFB" },
  next: { name: "Next.js", category: "framework", logo: "nextdotjs", color: "000000" },
  vue: { name: "Vue.js", category: "framework", logo: "vuedotjs", color: "4FC08D" },
  nuxt: { name: "Nuxt", category: "framework", logo: "nuxt", color: "00DC82" },
  svelte: { name: "Svelte", category: "framework", logo: "svelte", color: "FF3E00" },
  "@angular/core": { name: "Angular", category: "framework", logo: "angular", color: "DD0031" },
  "solid-js": { name: "SolidJS", category: "framework", logo: "solid", color: "2C4F7C" },
  astro: { name: "Astro", category: "framework", logo: "astro", color: "BC52EE" },
  express: { name: "Express", category: "framework", logo: "express", color: "000000" },
  fastify: { name: "Fastify", category: "framework", logo: "fastify", color: "000000" },
  hono: { name: "Hono", category: "framework", logo: "hono", color: "E36002" },
  "@nestjs/": { name: "NestJS", category: "framework", logo: "nestjs", color: "E0234E" },
  electron: { name: "Electron", category: "framework", logo: "electron", color: "47848F" },
  "react-native": { name: "React Native", category: "framework", logo: "react", color: "61DAFB" },
  vite: { name: "Vite", category: "tooling", logo: "vite", color: "646CFF" },
  webpack: { name: "Webpack", category: "tooling", logo: "webpack", color: "8DD6F9" },
  tailwindcss: { name: "Tailwind CSS", category: "library", logo: "tailwindcss", color: "06B6D4" },
  "styled-components": { name: "styled-components", category: "library", logo: "styledcomponents", color: "DB7093" },
  redux: { name: "Redux", category: "library", logo: "redux", color: "764ABC" },
  "@reduxjs/toolkit": { name: "Redux", category: "library", logo: "redux", color: "764ABC" },
  zustand: { name: "Zustand", category: "library", color: "443E38" },
  "@tanstack/react-query": { name: "TanStack Query", category: "library", logo: "reactquery", color: "FF4154" },
  graphql: { name: "GraphQL", category: "library", logo: "graphql", color: "E10098" },
  "@prisma/client": { name: "Prisma", category: "database", logo: "prisma", color: "2D3748" },
  prisma: { name: "Prisma", category: "database", logo: "prisma", color: "2D3748" },
  "drizzle-orm": { name: "Drizzle", category: "database", logo: "drizzle", color: "C5F74F" },
  mongoose: { name: "MongoDB", category: "database", logo: "mongodb", color: "47A248" },
  mongodb: { name: "MongoDB", category: "database", logo: "mongodb", color: "47A248" },
  pg: { name: "PostgreSQL", category: "database", logo: "postgresql", color: "4169E1" },
  mysql2: { name: "MySQL", category: "database", logo: "mysql", color: "4479A1" },
  redis: { name: "Redis", category: "database", logo: "redis", color: "FF4438" },
  ioredis: { name: "Redis", category: "database", logo: "redis", color: "FF4438" },
  "@supabase/supabase-js": { name: "Supabase", category: "database", logo: "supabase", color: "3FCF8E" },
  firebase: { name: "Firebase", category: "database", logo: "firebase", color: "DD2C00" },
  "socket.io": { name: "Socket.IO", category: "library", logo: "socketdotio", color: "010101" },
  "@anthropic-ai/sdk": { name: "Claude API", category: "library", logo: "anthropic", color: "191919" },
  openai: { name: "OpenAI", category: "library", logo: "openai", color: "412991" },
  zod: { name: "Zod", category: "library", logo: "zod", color: "3E67B1" },
  vitest: { name: "Vitest", category: "testing", logo: "vitest", color: "6E9F18" },
  jest: { name: "Jest", category: "testing", logo: "jest", color: "C21325" },
  "@playwright/test": { name: "Playwright", category: "testing", logo: "playwright", color: "2EAD33" },
  cypress: { name: "Cypress", category: "testing", logo: "cypress", color: "69D3A7" },
  eslint: { name: "ESLint", category: "tooling", logo: "eslint", color: "4B32C3" },
  // Python
  django: { name: "Django", category: "framework", logo: "django", color: "092E20" },
  flask: { name: "Flask", category: "framework", logo: "flask", color: "000000" },
  fastapi: { name: "FastAPI", category: "framework", logo: "fastapi", color: "009688" },
  streamlit: { name: "Streamlit", category: "framework", logo: "streamlit", color: "FF4B4B" },
  sqlalchemy: { name: "SQLAlchemy", category: "database", logo: "sqlalchemy", color: "D71F00" },
  pandas: { name: "Pandas", category: "library", logo: "pandas", color: "150458" },
  numpy: { name: "NumPy", category: "library", logo: "numpy", color: "013243" },
  "scikit-learn": { name: "scikit-learn", category: "library", logo: "scikitlearn", color: "F7931E" },
  torch: { name: "PyTorch", category: "library", logo: "pytorch", color: "EE4C2C" },
  tensorflow: { name: "TensorFlow", category: "library", logo: "tensorflow", color: "FF6F00" },
  pydantic: { name: "Pydantic", category: "library", logo: "pydantic", color: "E92063" },
  anthropic: { name: "Claude API", category: "library", logo: "anthropic", color: "191919" },
  pytest: { name: "Pytest", category: "testing", logo: "pytest", color: "0A9EDC" },
  "psycopg2-binary": { name: "PostgreSQL", category: "database", logo: "postgresql", color: "4169E1" },
  psycopg2: { name: "PostgreSQL", category: "database", logo: "postgresql", color: "4169E1" },
  // Java
  "org.springframework.boot:": { name: "Spring Boot", category: "framework", logo: "springboot", color: "6DB33F" },
  "io.quarkus:": { name: "Quarkus", category: "framework", logo: "quarkus", color: "4695EB" },
  "org.junit.jupiter:": { name: "JUnit 5", category: "testing", logo: "junit5", color: "25A162" },
  "org.postgresql:postgresql": { name: "PostgreSQL", category: "database", logo: "postgresql", color: "4169E1" },
  // Rust / Go / PHP / Ruby
  tokio: { name: "Tokio", category: "library", color: "000000" },
  "actix-web": { name: "Actix Web", category: "framework", color: "000000" },
  axum: { name: "Axum", category: "framework", color: "000000" },
  "github.com/gin-gonic/gin": { name: "Gin", category: "framework", logo: "gin", color: "008ECF" },
  "github.com/gofiber/fiber/": { name: "Fiber", category: "framework", color: "00ACD7" },
  "laravel/framework": { name: "Laravel", category: "framework", logo: "laravel", color: "FF2D20" },
  "symfony/": { name: "Symfony", category: "framework", logo: "symfony", color: "000000" },
  rails: { name: "Ruby on Rails", category: "framework", logo: "rubyonrails", color: "D30001" },
};

const PREFIX_KEYS = Object.keys(DEPENDENCIES).filter((k) => k.endsWith("/") || k.endsWith(":"));

const RUNTIME: Record<string, TechDef> = {
  node: { name: "Node.js", category: "language", logo: "nodedotjs", color: "5FA04E" },
};

export function matchDependency(depName: string): TechDef | undefined {
  const name = depName.toLowerCase();
  const exact = DEPENDENCIES[name];
  if (exact) return exact;
  const prefix = PREFIX_KEYS.find((p) => name.startsWith(p));
  return prefix ? DEPENDENCIES[prefix] : undefined;
}

/** Combina linguagens, dependências e arquivos da árvore em uma stack sem duplicatas. */
export function detectTechStack(
  languages: Record<string, number>,
  manifests: ManifestInfo[],
  tree: TreeEntry[],
): TechItem[] {
  const stack = new Map<string, TechItem>();
  const add = (item: TechItem) => {
    if (!stack.has(item.name)) stack.set(item.name, item);
  };

  const sortedLangs = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  for (const [lang, pct] of sortedLangs) {
    const def = LANGUAGES[lang];
    if (def && pct >= 1) add({ ...def, category: "language" });
  }
  if (manifests.some((m) => m.ecosystem === "node")) add(RUNTIME.node!);

  for (const manifest of manifests) {
    for (const dep of manifest.dependencies) {
      const def = matchDependency(dep.name);
      if (def) add({ ...def });
    }
  }

  const files = new Set(tree.map((t) => basename(t.path).toLowerCase()));
  if (files.has("dockerfile") || [...files].some((f) => /^(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(f)))
    add({ name: "Docker", category: "infra", logo: "docker", color: "2496ED" });
  if (tree.some((t) => t.path.startsWith(".github/workflows/")))
    add({ name: "GitHub Actions", category: "infra", logo: "githubactions", color: "2088FF" });
  if (files.has("vercel.json")) add({ name: "Vercel", category: "infra", logo: "vercel", color: "000000" });
  if (files.has("netlify.toml")) add({ name: "Netlify", category: "infra", logo: "netlify", color: "00C7B7" });
  if (tree.some((t) => /(^|\/)k8s\/|kustomization\.ya?ml$/.test(t.path)))
    add({ name: "Kubernetes", category: "infra", logo: "kubernetes", color: "326CE5" });

  return [...stack.values()];
}

export function detectSignals(tree: TreeEntry[]): RepoSignals {
  const paths = tree.map((t) => t.path.toLowerCase());
  const bases = new Set(paths.map((p) => basename(p)));
  const ciProviders: string[] = [];
  if (paths.some((p) => p.startsWith(".github/workflows/"))) ciProviders.push("GitHub Actions");
  if (bases.has(".gitlab-ci.yml")) ciProviders.push("GitLab CI");
  if (paths.some((p) => p.startsWith(".circleci/"))) ciProviders.push("CircleCI");
  if (bases.has("jenkinsfile")) ciProviders.push("Jenkins");
  if (bases.has("azure-pipelines.yml")) ciProviders.push("Azure Pipelines");

  const manifestCount = paths.filter((p) =>
    ["package.json", "pom.xml", "cargo.toml", "go.mod", "pyproject.toml"].includes(basename(p)),
  ).length;

  return {
    hasDocker: bases.has("dockerfile") || paths.some((p) => basename(p).endsWith(".dockerfile")),
    hasDockerCompose: [...bases].some((b) => /^(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(b)),
    hasCI: ciProviders.length > 0,
    ciProviders,
    hasTests: paths.some(
      (p) =>
        /(^|\/)(tests?|__tests__|spec)\//.test(p) ||
        /\.(test|spec)\.[jt]sx?$/.test(p) ||
        /(^|\/)test_[^/]+\.py$/.test(p) ||
        /_test\.go$/.test(p),
    ),
    hasLicenseFile: [...bases].some((b) => /^licen[sc]e(\.\w+)?$/.test(b)),
    hasContributing: bases.has("contributing.md"),
    hasCodeOfConduct: bases.has("code_of_conduct.md"),
    hasEnvExample: [...bases].some((b) => /^\.env\.(example|sample|template)$/.test(b)),
    hasChangelog: bases.has("changelog.md"),
    isMonorepo:
      bases.has("pnpm-workspace.yaml") ||
      bases.has("lerna.json") ||
      bases.has("turbo.json") ||
      bases.has("nx.json") ||
      manifestCount > 2,
  };
}

/** Infere o gerenciador de pacotes Node pelos lockfiles presentes. */
export function detectNodePackageManager(tree: TreeEntry[]): ManifestInfo["packageManager"] | undefined {
  const bases = new Set(tree.filter((t) => !t.path.includes("/")).map((t) => t.path));
  if (bases.has("pnpm-lock.yaml")) return "pnpm";
  if (bases.has("yarn.lock")) return "yarn";
  if (bases.has("bun.lockb") || bases.has("bun.lock")) return "bun";
  if (bases.has("package-lock.json")) return "npm";
  return undefined;
}
