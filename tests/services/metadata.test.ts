import { describe, expect, it } from "vitest";
import { deriveCommands } from "../../src/services/commands";
import { languagesFromTree, parseTreeText, pickManifestPaths } from "../../src/services/metadataBuilder";
import { buildManualMetadata } from "../../src/services/localProject";
import { detectSignals, matchDependency } from "../../src/services/techDetector";
import { makeNodeMetadata, nodeTree } from "../fixtures/metadata";

describe("buildMetadata", () => {
  const meta = makeNodeMetadata();

  it("filtra node_modules e detecta pnpm pelo lockfile", () => {
    expect(meta.tree.some((t) => t.path.includes("node_modules"))).toBe(false);
    expect(meta.manifests[0]?.packageManager).toBe("pnpm");
  });

  it("detecta stack a partir de linguagens, dependências e infraestrutura", () => {
    const names = meta.techStack.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["TypeScript", "Node.js", "Express", "PostgreSQL", "Zod", "Vitest", "Docker", "GitHub Actions"]));
    expect(new Set(names).size).toBe(names.length);
  });

  it("detecta sinais estruturais", () => {
    expect(meta.signals).toMatchObject({ hasDocker: true, hasDockerCompose: true, hasCI: true, hasTests: true, hasLicenseFile: true, hasEnvExample: true });
    expect(meta.envVars).toEqual(["DATABASE_URL", "JWT_SECRET", "PORT"]);
  });
});

describe("techDetector", () => {
  it("casa dependências por prefixo de escopo", () => {
    expect(matchDependency("@nestjs/core")?.name).toBe("NestJS");
    expect(matchDependency("org.springframework.boot:spring-boot-starter-web")?.name).toBe("Spring Boot");
    expect(matchDependency("left-pad")).toBeUndefined();
  });

  it("não confunde arquivos compose.ts com Docker Compose", () => {
    expect(detectSignals([{ path: "src/compose.ts", type: "file" }]).hasDockerCompose).toBe(false);
    expect(detectSignals([{ path: "compose.yaml", type: "file" }]).hasDockerCompose).toBe(true);
  });
});

describe("deriveCommands", () => {
  it("usa somente scripts existentes com o gerenciador detectado", () => {
    const c = deriveCommands(makeNodeMetadata());
    expect(c.install).toEqual(["pnpm install", "cp .env.example .env"]);
    expect(c).toMatchObject({ dev: "pnpm dev", build: "pnpm build", test: "pnpm test", lint: "pnpm lint" });
    expect(c.start).toBeUndefined();
    expect(c.docker).toEqual(["docker compose up -d --build"]);
    expect(c.prerequisites).toContain("Node.js >=20");
  });

  it("ignora o script de teste placeholder do npm init", () => {
    const meta = buildManualMetadata({
      name: "x",
      treeText: "index.js",
      files: [{ path: "package.json", content: JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }],
    });
    expect(deriveCommands(meta).test).toBeUndefined();
  });

  it("gera comandos Python com venv e pytest", () => {
    const meta = buildManualMetadata({
      name: "api",
      treeText: "main.py\nrequirements.txt",
      files: [{ path: "requirements.txt", content: "fastapi\nuvicorn\npytest" }],
    });
    const c = deriveCommands(meta);
    expect(c.install).toEqual(["python -m venv .venv", "source .venv/bin/activate", "pip install -r requirements.txt"]);
    expect(c.dev).toBe("uvicorn main:app --reload");
    expect(c.test).toBe("pytest");
  });
});

describe("parseTreeText", () => {
  it("entende a saída do comando tree", () => {
    const tree = parseTreeText(`.
├── src
│   ├── main.ts
│   └── utils
│       └── math.ts
├── package.json
└── README.md

3 directories, 4 files`);
    expect(tree.filter((t) => t.type === "dir").map((t) => t.path)).toEqual(["src", "src/utils"]);
    expect(tree.filter((t) => t.type === "file").map((t) => t.path)).toEqual(["README.md", "package.json", "src/main.ts", "src/utils/math.ts"]);
  });

  it("entende listas de caminhos (find)", () => {
    const tree = parseTreeText("./src/a.py\n./src/b.py\n./setup.cfg\n");
    expect(tree).toContainEqual({ path: "src", type: "dir" });
    expect(tree).toContainEqual({ path: "src/a.py", type: "file" });
  });
});

describe("helpers de árvore", () => {
  it("languagesFromTree pondera por tamanho", () => {
    expect(languagesFromTree([
      { path: "a.ts", type: "file", size: 300 },
      { path: "b.py", type: "file", size: 100 },
      { path: "c.md", type: "file", size: 999 },
    ])).toEqual({ TypeScript: 75, Python: 25 });
  });

  it("pickManifestPaths prioriza a raiz e ignora arquivos profundos", () => {
    const paths = pickManifestPaths([...nodeTree, { path: "a/b/c/d/package.json", type: "file" }, { path: "packages/web/package.json", type: "file" }]);
    expect(paths[0]).toBe("package.json");
    expect(paths).toContain("packages/web/package.json");
    expect(paths).not.toContain("a/b/c/d/package.json");
  });

  it("buildManualMetadata exige nome", () => {
    expect(() => buildManualMetadata({ name: "  ", treeText: "", files: [] })).toThrow(/nome/);
  });
});

describe("correções da revisão de código", () => {
  it("Maven com package.json de tooling na raiz usa comandos Java", () => {
    const meta = buildManualMetadata({
      name: "svc",
      treeText: "src/main/java/App.java\nmvnw",
      files: [
        { path: "package.json", content: JSON.stringify({ scripts: { lint: "prettier ." } }) },
        { path: "pom.xml", content: "<project><artifactId>svc</artifactId><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>" },
      ],
    });
    const c = deriveCommands(meta);
    expect(c.install).toEqual(["./mvnw clean install"]);
    expect(c.dev).toBe("./mvnw spring-boot:run");
  });

  it("uv e Poetry executam ferramentas dentro do ambiente", () => {
    const uv = buildManualMetadata({
      name: "x",
      treeText: "main.py",
      files: [{ path: "pyproject.toml", content: '[project]\nname = "x"\ndependencies = ["fastapi", "uvicorn", "pytest"]\n\n[tool.uv]\n' }],
    });
    expect(deriveCommands(uv)).toMatchObject({ dev: "uv run uvicorn main:app --reload", test: "uv run pytest" });
  });

  it("cargo run só para crates com binário", () => {
    const lib = buildManualMetadata({ name: "lib", treeText: "src/lib.rs", files: [{ path: "Cargo.toml", content: '[package]\nname = "lib"' }] });
    expect(deriveCommands(lib).dev).toBeUndefined();
    const bin = buildManualMetadata({ name: "bin", treeText: "src/main.rs", files: [{ path: "Cargo.toml", content: '[package]\nname = "bin"' }] });
    expect(deriveCommands(bin).dev).toBe("cargo run");
  });

  it("metadados gerados sempre passam no schema da rota /generate", async () => {
    const { repoMetadataSchema } = await import("../../src/types/schemas");
    const envFile = Array.from({ length: 150 }, (_, i) => `VAR_${i}=x`).join("\n");
    const meta = buildManualMetadata({
      name: "big",
      treeText: "index.js",
      files: [
        { path: "package.json", content: JSON.stringify({ license: "L".repeat(90), scripts: { build: "x".repeat(900) } }) },
        { path: ".env.example", content: envFile },
      ],
    });
    expect(repoMetadataSchema.safeParse(meta).success).toBe(true);
  });

  it("go.mod com sufixo de versão maior usa o nome do módulo", async () => {
    const { parseGoMod } = await import("../../src/services/manifestParsers");
    expect(parseGoMod("module github.com/foo/bar/v2\n").name).toBe("bar");
  });
});
