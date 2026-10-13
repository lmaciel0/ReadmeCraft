export type TemplateId = "minimalist" | "showcase" | "enterprise" | "opensource";

export interface ReadmeTemplate {
  id: TemplateId;
  name: string;
  tagline: string;
  /** Diretrizes de estilo injetadas no prompt e usadas pelo gerador offline. */
  guidelines: string[];
  badgeStyle: BadgeStyle;
  /** Seções habilitadas por padrão ao escolher o template. */
  defaultSections: SectionId[];
  useEmoji: boolean;
}

export type BadgeStyle = "flat" | "flat-square" | "for-the-badge" | "plastic";

export type SectionId =
  | "header"
  | "badges"
  | "about"
  | "features"
  | "techStack"
  | "architecture"
  | "prerequisites"
  | "installation"
  | "usage"
  | "envVars"
  | "docker"
  | "tests"
  | "projectStructure"
  | "roadmap"
  | "contributing"
  | "license"
  | "acknowledgements";

export type Tone = "professional" | "friendly" | "technical";
export type ReadmeLanguage = "pt-BR" | "en";
