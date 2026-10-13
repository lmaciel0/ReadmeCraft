import type { ReadmeLanguage, SectionId } from "../types/template";

interface Strings {
  headings: Record<Exclude<SectionId, "header" | "badges">, string>;
  defaultTagline: (name: string) => string;
  aboutFallback: string;
  featuresTodo: string;
  architectureIntro: string;
  clone: string;
  install: string;
  env: string;
  run: string;
  noScripts: string;
  envTable: [string, string, string];
  envCopy: string;
  envDescTodo: string;
  yes: string;
  dockerIntro: string;
  testsIntro: string;
  noTests: string;
  structureIntro: string;
  roadmapItems: { done: (s: { tests: boolean; ci: boolean; docker: boolean }) => [string, boolean][] };
  contributingSteps: string[];
  contributingGuide: string;
  licenseText: (name: string) => string;
  licenseTodo: string;
  ackIntro: string;
  scriptLabels: Record<"dev" | "start" | "build" | "test" | "lint", string>;
}

export const STRINGS: Record<ReadmeLanguage, Strings> = {
  "pt-BR": {
    headings: {
      about: "Sobre o projeto",
      features: "Funcionalidades",
      techStack: "Tecnologias",
      architecture: "Arquitetura",
      prerequisites: "Pré-requisitos",
      installation: "Instalação",
      usage: "Como usar",
      envVars: "Variáveis de ambiente",
      docker: "Docker",
      tests: "Testes",
      projectStructure: "Estrutura do projeto",
      roadmap: "Roadmap",
      contributing: "Como contribuir",
      license: "Licença",
      acknowledgements: "Agradecimentos",
    },
    defaultTagline: (name) => `Documentação do projeto ${name}.`,
    aboutFallback: "<!-- TODO: descreva o problema que o projeto resolve e para quem ele foi feito. -->",
    featuresTodo: "<!-- TODO: liste as principais funcionalidades. -->",
    architectureIntro: "Visão geral dos principais módulos e de como eles se comunicam:",
    clone: "Clone o repositório",
    install: "Instale as dependências",
    env: "Configure as variáveis de ambiente",
    run: "Execute o projeto",
    noScripts: "<!-- TODO: documente como executar o projeto. -->",
    envTable: ["Variável", "Descrição", "Obrigatória"],
    envCopy: "Copie o arquivo de exemplo e preencha os valores:",
    envDescTodo: "<!-- TODO -->",
    yes: "Sim",
    dockerIntro: "Para executar com Docker:",
    testsIntro: "Para rodar a suíte de testes:",
    noTests: "<!-- TODO: adicione testes automatizados. -->",
    structureIntro: "Organização dos principais diretórios:",
    roadmapItems: {
      done: (s) => [
        ["Estrutura inicial do projeto", true],
        ["Testes automatizados", s.tests],
        ["Pipeline de CI", s.ci],
        ["Imagem Docker", s.docker],
        ["Documentação completa", false],
      ],
    },
    contributingSteps: [
      "Faça um fork do projeto",
      "Crie uma branch: `git checkout -b feat/minha-feature`",
      "Faça commit das alterações: `git commit -m 'feat: minha feature'`",
      "Envie para o seu fork: `git push origin feat/minha-feature`",
      "Abra um Pull Request",
    ],
    contributingGuide: "Leia o [guia de contribuição](CONTRIBUTING.md) antes de começar.",
    licenseText: (name) => `Distribuído sob a licença **${name}**. Veja [LICENSE](LICENSE) para mais detalhes.`,
    licenseTodo: "<!-- TODO: escolha uma licença (https://choosealicense.com). -->",
    ackIntro: "Este projeto é construído sobre excelentes projetos open source:",
    scriptLabels: {
      dev: "Ambiente de desenvolvimento",
      start: "Executar",
      build: "Build de produção",
      test: "Testes",
      lint: "Lint",
    },
  },
  en: {
    headings: {
      about: "About",
      features: "Features",
      techStack: "Tech Stack",
      architecture: "Architecture",
      prerequisites: "Prerequisites",
      installation: "Installation",
      usage: "Usage",
      envVars: "Environment Variables",
      docker: "Docker",
      tests: "Tests",
      projectStructure: "Project Structure",
      roadmap: "Roadmap",
      contributing: "Contributing",
      license: "License",
      acknowledgements: "Acknowledgements",
    },
    defaultTagline: (name) => `Documentation for ${name}.`,
    aboutFallback: "<!-- TODO: describe the problem this project solves and who it is for. -->",
    featuresTodo: "<!-- TODO: list the main features. -->",
    architectureIntro: "Overview of the main modules and how they interact:",
    clone: "Clone the repository",
    install: "Install dependencies",
    env: "Configure environment variables",
    run: "Run the project",
    noScripts: "<!-- TODO: document how to run the project. -->",
    envTable: ["Variable", "Description", "Required"],
    envCopy: "Copy the example file and fill in the values:",
    envDescTodo: "<!-- TODO -->",
    yes: "Yes",
    dockerIntro: "To run with Docker:",
    testsIntro: "To run the test suite:",
    noTests: "<!-- TODO: add automated tests. -->",
    structureIntro: "Layout of the main directories:",
    roadmapItems: {
      done: (s) => [
        ["Initial project structure", true],
        ["Automated tests", s.tests],
        ["CI pipeline", s.ci],
        ["Docker image", s.docker],
        ["Complete documentation", false],
      ],
    },
    contributingSteps: [
      "Fork the project",
      "Create a branch: `git checkout -b feat/my-feature`",
      "Commit your changes: `git commit -m 'feat: my feature'`",
      "Push to your fork: `git push origin feat/my-feature`",
      "Open a Pull Request",
    ],
    contributingGuide: "Please read the [contributing guide](CONTRIBUTING.md) first.",
    licenseText: (name) => `Distributed under the **${name}** license. See [LICENSE](LICENSE) for details.`,
    licenseTodo: "<!-- TODO: pick a license (https://choosealicense.com). -->",
    ackIntro: "This project stands on the shoulders of great open-source work:",
    scriptLabels: {
      dev: "Development server",
      start: "Run",
      build: "Production build",
      test: "Tests",
      lint: "Lint",
    },
  },
};

/** Emojis usados nos títulos quando o template permite. */
export const SECTION_EMOJI: Partial<Record<SectionId, string>> = {
  about: "📖",
  features: "✨",
  techStack: "🛠️",
  architecture: "🏗️",
  prerequisites: "📋",
  installation: "🚀",
  usage: "💡",
  envVars: "🔐",
  docker: "🐳",
  tests: "🧪",
  projectStructure: "📁",
  roadmap: "🗺️",
  contributing: "🤝",
  license: "📄",
  acknowledgements: "🙏",
};
