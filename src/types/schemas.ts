import { z } from "zod";
import { generatorOptionsSchema } from "./readme";

/**
 * Schema de validação dos metadados recebidos pelo backend.
 * Limites de tamanho evitam payloads gigantes (abuso de tokens / memória).
 */
const shortStr = z.string().max(300);
const maxKeys = (n: number) => (obj: Record<string, unknown>) => Object.keys(obj).length <= n;
const dependencySchema = z.object({
  name: z.string().max(200),
  version: z.string().max(100).optional(),
  dev: z.boolean().optional(),
});

const manifestSchema = z.object({
  file: shortStr,
  ecosystem: z.enum(["node", "python", "java", "rust", "go", "php", "ruby", "dotnet", "unknown"]),
  packageManager: z
    .enum(["npm", "yarn", "pnpm", "bun", "pip", "poetry", "uv", "maven", "gradle", "cargo", "go", "composer", "bundler"])
    .optional(),
  name: shortStr.optional(),
  version: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  license: z.string().max(100).optional(),
  dependencies: z.array(dependencySchema).max(500),
  scripts: z.record(z.string().max(100), z.string().max(500)).refine(maxKeys(50), "Muitos scripts"),
  engines: z.record(z.string().max(100), z.string().max(100)).refine(maxKeys(20), "Muitas engines").optional(),
});

export const repoMetadataSchema = z.object({
  source: z.enum(["github", "manual"]),
  name: z.string().min(1).max(200),
  owner: shortStr.optional(),
  fullName: shortStr.optional(),
  url: z.url().max(500).optional(),
  description: z.string().max(2000).optional(),
  homepage: z.string().max(500).optional(),
  topics: z.array(z.string().max(60)).max(30),
  license: z.object({ spdxId: z.string().max(60), name: z.string().max(200) }).optional(),
  stars: z.number().int().nonnegative().optional(),
  forks: z.number().int().nonnegative().optional(),
  openIssues: z.number().int().nonnegative().optional(),
  defaultBranch: z.string().max(200).optional(),
  latestRelease: z
    .object({ tag: z.string().max(200), name: z.string().max(300).optional(), url: z.string().max(500).optional() })
    .optional(),
  languages: z.record(z.string().max(60), z.number().min(0).max(100)).refine(maxKeys(60), "Muitas linguagens"),
  tree: z
    .array(z.object({ path: z.string().max(500), type: z.enum(["file", "dir"]), size: z.number().optional() }))
    .max(5000),
  treeTruncated: z.boolean().optional(),
  manifests: z.array(manifestSchema).max(20),
  techStack: z
    .array(
      z.object({
        name: z.string().max(100),
        category: z.enum(["language", "framework", "library", "database", "tooling", "testing", "infra"]),
        logo: z.string().max(100).optional(),
        color: z.string().max(10).optional(),
      }),
    )
    .max(80),
  signals: z.object({
    hasDocker: z.boolean(),
    hasDockerCompose: z.boolean(),
    hasCI: z.boolean(),
    ciProviders: z.array(z.string().max(60)).max(10),
    hasTests: z.boolean(),
    hasLicenseFile: z.boolean(),
    hasContributing: z.boolean(),
    hasCodeOfConduct: z.boolean(),
    hasEnvExample: z.boolean(),
    hasChangelog: z.boolean(),
    isMonorepo: z.boolean(),
  }),
  envVars: z.array(z.string().max(120)).max(100),
});

export const generateRequestSchema = z.object({
  metadata: repoMetadataSchema,
  options: generatorOptionsSchema,
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
