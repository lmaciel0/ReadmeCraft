import type { ReadmeSection } from "../types/readme";
import type { ReadmeTemplate, SectionId, TemplateId } from "../types/template";

export const SECTIONS: ReadmeSection[] = [
  { id: "header", title: "Título e descrição", description: "Nome do projeto e frase de impacto", required: true },
  { id: "badges", title: "Badges", description: "Shields.io: licença, versão, CI, stack" },
  { id: "about", title: "Sobre", description: "Problema que o projeto resolve" },
  { id: "features", title: "Funcionalidades", description: "Lista dos principais recursos" },
  { id: "techStack", title: "Tech Stack", description: "Tecnologias em badges" },
  { id: "architecture", title: "Arquitetura", description: "Diagrama Mermaid da estrutura" },
  { id: "prerequisites", title: "Pré-requisitos", description: "Runtimes e ferramentas necessárias" },
  { id: "installation", title: "Instalação", description: "Passo a passo para rodar localmente" },
  { id: "usage", title: "Uso", description: "Scripts e exemplos de execução" },
  { id: "envVars", title: "Variáveis de ambiente", description: "Tabela a partir do .env.example" },
  { id: "docker", title: "Docker", description: "Execução com Docker / Compose" },
  { id: "tests", title: "Testes", description: "Como rodar a suíte de testes" },
  { id: "projectStructure", title: "Estrutura de pastas", description: "Árvore resumida do projeto" },
  { id: "roadmap", title: "Roadmap", description: "Próximos passos (checklist)" },
  { id: "contributing", title: "Contribuição", description: "Fluxo de fork, branch e PR" },
  { id: "license", title: "Licença", description: "Licença detectada no repositório" },
  { id: "acknowledgements", title: "Agradecimentos", description: "Créditos e inspirações" },
];

export const SECTION_TITLES: Record<SectionId, string> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s.title]),
) as Record<SectionId, string>;

export const TEMPLATES: Record<TemplateId, ReadmeTemplate> = {
  minimalist: {
    id: "minimalist",
    name: "Minimalist",
    tagline: "Direto ao ponto, foco em código",
    badgeStyle: "flat-square",
    useEmoji: false,
    defaultSections: ["header", "badges", "about", "installation", "usage", "license"],
    guidelines: [
      "Seja conciso: frases curtas, sem marketing.",
      "No máximo 4 badges, estilo flat-square.",
      "Priorize blocos de código executáveis sobre prosa.",
      "Não use emojis nos títulos.",
    ],
  },
  showcase: {
    id: "showcase",
    name: "Showcase",
    tagline: "Alta estética para portfólio",
    badgeStyle: "for-the-badge",
    useEmoji: true,
    defaultSections: [
      "header",
      "badges",
      "about",
      "features",
      "techStack",
      "architecture",
      "installation",
      "usage",
      "projectStructure",
      "contributing",
      "license",
    ],
    guidelines: [
      "Cabeçalho centralizado com <div align=\"center\">, título, tagline e badges.",
      "Badges coloridos no estilo for-the-badge com logos do Simple Icons.",
      "Use emojis com moderação nos títulos de seção.",
      "Destaque funcionalidades em lista com ícones ou tabela.",
      "Inclua um diagrama Mermaid de arquitetura.",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Governança, segurança e CI/CD",
    badgeStyle: "flat",
    useEmoji: false,
    defaultSections: [
      "header",
      "badges",
      "about",
      "architecture",
      "prerequisites",
      "installation",
      "envVars",
      "docker",
      "tests",
      "projectStructure",
      "contributing",
      "license",
    ],
    guidelines: [
      "Tom formal e objetivo, sem emojis.",
      "Inclua índice (table of contents) logo após a descrição.",
      "Documente variáveis de ambiente em tabela e destaque segurança com alerts do GitHub (> [!IMPORTANT]).",
      "Explique pipeline de CI/CD e execução em contêiner quando detectados.",
    ],
  },
  opensource: {
    id: "opensource",
    name: "Open Source",
    tagline: "Comunidade, roadmap e contribuições",
    badgeStyle: "flat",
    useEmoji: true,
    defaultSections: [
      "header",
      "badges",
      "about",
      "features",
      "installation",
      "usage",
      "roadmap",
      "contributing",
      "license",
      "acknowledgements",
    ],
    guidelines: [
      "Tom acolhedor que convida contribuições.",
      "Badges de comunidade: estrelas, forks, issues abertas, PRs welcome.",
      "Roadmap em checklist (- [ ]).",
      "Seção de contribuição detalhada: fork, branch, commit convencional, PR.",
    ],
  },
};

export const TEMPLATE_LIST = Object.values(TEMPLATES);
