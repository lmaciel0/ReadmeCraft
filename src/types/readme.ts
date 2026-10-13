import { z } from "zod";
import type { SectionId } from "./template";

export interface ReadmeSection {
  id: SectionId;
  title: string;
  description: string;
  /** Seções obrigatórias não podem ser desligadas. */
  required?: boolean;
}

export const TEMPLATE_IDS = ["minimalist", "showcase", "enterprise", "opensource"] as const;
export const SECTION_IDS = [
  "header",
  "badges",
  "about",
  "features",
  "techStack",
  "architecture",
  "prerequisites",
  "installation",
  "usage",
  "envVars",
  "docker",
  "tests",
  "projectStructure",
  "roadmap",
  "contributing",
  "license",
  "acknowledgements",
] as const satisfies readonly SectionId[];

export const generatorOptionsSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  sections: z.array(z.enum(SECTION_IDS)).min(1).max(SECTION_IDS.length),
  tone: z.enum(["professional", "friendly", "technical"]),
  language: z.enum(["pt-BR", "en"]),
  includeEmoji: z.boolean(),
  /** Quando definido, gera apenas esta seção (regeneração pontual). */
  onlySection: z.enum(SECTION_IDS).optional(),
  /** Instruções livres do usuário, limitadas para evitar abuso de tokens. */
  extraInstructions: z.string().max(1000).optional(),
});

export type GeneratorOptions = z.infer<typeof generatorOptionsSchema>;

/** Origem do texto gerado: Claude ou gerador determinístico por templates. */
export type GeneratorEngine = "claude" | "template";

export interface HealthStatus {
  ok: boolean;
  ai: boolean;
  model: string | null;
}
