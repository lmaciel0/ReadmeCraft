import type { ManifestInfo, RepoMetadata } from "../types/github";

/**
 * Comandos verificáveis derivados exclusivamente dos manifestos e da árvore.
 * São passados ao modelo como a ÚNICA fonte de comandos permitida, evitando
 * alucinações como `npm run dev` em projetos que não têm esse script.
 */
export interface ProjectCommands {
  ecosystem: ManifestInfo["ecosystem"];
  install: string[];
  dev?: string;
  start?: string;
  build?: string;
  test?: string;
  lint?: string;
  docker: string[];
  prerequisites: string[];
}

const RUNNERS: Record<string, (script: string) => string> = {
  npm: (s) => (s === "test" || s === "start" ? `npm ${s}` : `npm run ${s}`),
  yarn: (s) => `yarn ${s}`,
  pnpm: (s) => `pnpm ${s}`,
  bun: (s) => `bun run ${s}`,
};

const INSTALL: Record<string, string> = {
  npm: "npm install",
  yarn: "yarn install",
  pnpm: "pnpm install",
  bun: "bun install",
};

export function deriveCommands(meta: RepoMetadata): ProjectCommands {
  const root = meta.manifests[0];
  const paths = new Set(meta.tree.map((t) => t.path));
  const has = (p: string) => paths.has(p);
  const result: ProjectCommands = {
    ecosystem: root?.ecosystem ?? "unknown",
    install: [],
    docker: [],
    prerequisites: [],
  };

  if (root) {
    switch (root.ecosystem) {
      case "node": {
        const pm = root.packageManager ?? "npm";
        const run = RUNNERS[pm] ?? RUNNERS.npm!;
        result.install.push(INSTALL[pm] ?? "npm install");
        const s = root.scripts;
        if (s.dev) result.dev = run("dev");
        if (s.start) result.start = run("start");
        if (s.build) result.build = run("build");
        if (s.test && !/no test specified/.test(s.test)) result.test = run("test");
        if (s.lint) result.lint = run("lint");
        result.prerequisites.push(`Node.js ${root.engines?.node ?? "(LTS)"}`);
        if (pm !== "npm") result.prerequisites.push(pm);
        break;
      }
      case "python": {
        const hasDep = (name: string) => meta.manifests.some((m) => m.dependencies.some((d) => d.name.toLowerCase() === name));
        // Com Poetry/uv as ferramentas ficam no ambiente do projeto: precisam de `poetry run` / `uv run`.
        const exec = root.packageManager === "poetry" ? "poetry run " : root.packageManager === "uv" ? "uv run " : "";
        if (root.packageManager === "poetry") {
          result.install.push("poetry install");
        } else if (root.packageManager === "uv") {
          result.install.push("uv sync");
        } else {
          result.install.push("python -m venv .venv", "source .venv/bin/activate");
          result.install.push(has("requirements.txt") ? "pip install -r requirements.txt" : "pip install -e .");
        }
        if (hasDep("pytest")) result.test = `${exec}pytest`;
        if (hasDep("fastapi") && hasDep("uvicorn")) {
          const entry = ["main.py", "app/main.py", "src/main.py"].find(has);
          if (entry) result.dev = `${exec}uvicorn ${entry.replace(/\.py$/, "").replace(/\//g, ".")}:app --reload`;
        } else if (hasDep("django") && has("manage.py")) {
          result.dev = `${exec}python manage.py runserver`;
        } else if (hasDep("flask")) {
          result.dev = `${exec}flask run`;
        } else if (hasDep("streamlit")) {
          const entry = ["app.py", "main.py", "streamlit_app.py"].find(has);
          if (entry) result.dev = `${exec}streamlit run ${entry}`;
        } else if (has("main.py")) {
          result.start = `${exec}python main.py`;
        }
        result.prerequisites.push(`Python ${root.engines?.python ?? "3"}`);
        if (root.packageManager === "poetry" || root.packageManager === "uv") result.prerequisites.push(root.packageManager);
        break;
      }
      case "java": {
        const isSpring = root.dependencies.some((d) => d.name.startsWith("org.springframework.boot:"));
        if (root.packageManager === "gradle") {
          const g = has("gradlew") ? "./gradlew" : "gradle";
          result.install.push(`${g} build`);
          result.test = `${g} test`;
          if (isSpring) result.dev = `${g} bootRun`;
        } else {
          const m = has("mvnw") ? "./mvnw" : "mvn";
          result.install.push(`${m} clean install`);
          result.test = `${m} test`;
          if (isSpring) result.dev = `${m} spring-boot:run`;
        }
        result.prerequisites.push(`JDK ${root.engines?.java ?? "17+"}`);
        if (!has("mvnw") && !has("gradlew")) result.prerequisites.push(root.packageManager === "gradle" ? "Gradle" : "Maven");
        break;
      }
      case "rust":
        result.install.push("cargo build");
        // Crates de biblioteca e workspaces virtuais não têm binário para `cargo run`.
        if (has("src/main.rs")) result.dev = "cargo run";
        result.test = "cargo test";
        result.prerequisites.push(`Rust ${root.engines?.rust ?? "(stable)"} + Cargo`);
        break;
      case "go":
        result.install.push("go mod download");
        if (has("main.go")) result.dev = "go run .";
        result.test = "go test ./...";
        result.prerequisites.push(`Go ${root.engines?.go ?? ""}`.trim());
        break;
      case "php":
        result.install.push("composer install");
        if (has("artisan")) {
          result.install.push("cp .env.example .env", "php artisan key:generate");
          result.dev = "php artisan serve";
        }
        if (root.scripts.test) result.test = "composer test";
        result.prerequisites.push(`PHP ${root.engines?.php ?? ""}`.trim(), "Composer");
        break;
      case "ruby":
        result.install.push("bundle install");
        if (has("bin/rails")) result.dev = "bin/rails server";
        result.prerequisites.push(`Ruby ${root.engines?.ruby ?? ""}`.trim(), "Bundler");
        break;
      default:
        break;
    }
  }

  if (meta.signals.hasDockerCompose) {
    result.docker.push("docker compose up -d --build");
    result.prerequisites.push("Docker + Docker Compose");
  } else if (meta.signals.hasDocker) {
    const image = meta.name.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
    result.docker.push(`docker build -t ${image} .`, `docker run --rm -it ${image}`);
    result.prerequisites.push("Docker");
  }

  if (meta.envVars.length && !result.install.some((c) => c.startsWith("cp .env"))) {
    const envFile = meta.tree.find((t) => /^\.env\.(example|sample|template)$/i.test(t.path))?.path ?? ".env.example";
    result.install.push(`cp ${envFile} .env`);
  }
  return result;
}

/** Comando de clone, quando o repositório tem URL pública. */
export function cloneCommands(meta: RepoMetadata): string[] {
  if (!meta.url) return [];
  return [`git clone ${meta.url}.git`, `cd ${meta.name}`];
}
