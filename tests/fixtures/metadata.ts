import { buildMetadata } from "../../src/services/metadataBuilder";
import type { RepoMetadata, TreeEntry } from "../../src/types/github";
import type { GeneratorOptions } from "../../src/types/readme";

export const nodePackageJson = JSON.stringify({
  name: "acme-api",
  version: "1.4.0",
  description: "API de pedidos da Acme",
  license: "MIT",
  scripts: { dev: "tsx watch src/index.ts", build: "tsc", test: "vitest run", lint: "eslint ." },
  dependencies: { express: "^4.19.0", pg: "^8.11.0", zod: "^3.23.0" },
  devDependencies: { vitest: "^2.0.0", typescript: "^5.5.0" },
  engines: { node: ">=20" },
});

export const nodeTree: TreeEntry[] = [
  { path: "src", type: "dir" },
  { path: "src/index.ts", type: "file", size: 1200 },
  { path: "src/routes", type: "dir" },
  { path: "src/routes/orders.ts", type: "file", size: 3000 },
  { path: "tests", type: "dir" },
  { path: "tests/orders.test.ts", type: "file", size: 800 },
  { path: "package.json", type: "file", size: 400 },
  { path: "pnpm-lock.yaml", type: "file", size: 90000 },
  { path: "Dockerfile", type: "file", size: 300 },
  { path: "docker-compose.yml", type: "file", size: 300 },
  { path: ".env.example", type: "file", size: 80 },
  { path: ".github", type: "dir" },
  { path: ".github/workflows", type: "dir" },
  { path: ".github/workflows/ci.yml", type: "file", size: 500 },
  { path: "LICENSE", type: "file", size: 1000 },
  { path: "node_modules/express/index.js", type: "file", size: 10 },
];

export function makeNodeMetadata(overrides: Partial<RepoMetadata> = {}): RepoMetadata {
  const meta = buildMetadata({
    source: "github",
    name: "acme-api",
    tree: nodeTree,
    files: {
      "package.json": nodePackageJson,
      ".env.example": "DATABASE_URL=postgres://localhost/acme\nJWT_SECRET=change-me\n# comment\nexport PORT=3000\n",
    },
    languages: { TypeScript: 92.5, Dockerfile: 7.5 },
    extra: {
      owner: "acme",
      fullName: "acme/acme-api",
      url: "https://github.com/acme/acme-api",
      license: { spdxId: "MIT", name: "MIT License" },
      defaultBranch: "main",
      topics: ["api", "orders"],
      stars: 42,
      forks: 3,
      openIssues: 1,
    },
  });
  return { ...meta, ...overrides };
}

export const defaultOptions: GeneratorOptions = {
  template: "showcase",
  sections: ["header", "badges", "about", "techStack", "architecture", "installation", "envVars", "license"],
  tone: "professional",
  language: "pt-BR",
  includeEmoji: true,
};
