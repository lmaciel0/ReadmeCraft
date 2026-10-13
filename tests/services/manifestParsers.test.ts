import { describe, expect, it } from "vitest";
import {
  parseCargoToml,
  parseEnvExample,
  parseGoMod,
  parseGradle,
  parseManifest,
  parsePackageJson,
  parsePep508,
  parsePomXml,
  parsePyprojectToml,
  parseRequirementsTxt,
} from "../../src/services/manifestParsers";
import { nodePackageJson } from "../fixtures/metadata";

describe("parsePackageJson", () => {
  it("extrai metadados, scripts e dependências (dev marcadas)", () => {
    const m = parsePackageJson(nodePackageJson);
    expect(m).toMatchObject({ ecosystem: "node", name: "acme-api", version: "1.4.0", license: "MIT", engines: { node: ">=20" } });
    expect(m.scripts.dev).toBe("tsx watch src/index.ts");
    expect(m.dependencies).toContainEqual({ name: "express", version: "^4.19.0", dev: false });
    expect(m.dependencies).toContainEqual({ name: "vitest", version: "^2.0.0", dev: true });
  });

  it("detecta o gerenciador pelo campo packageManager", () => {
    expect(parsePackageJson(JSON.stringify({ packageManager: "pnpm@9.1.0" })).packageManager).toBe("pnpm");
  });

  it("ignora campos com tipos inesperados", () => {
    const m = parsePackageJson(JSON.stringify({ name: 123, scripts: { ok: "x", bad: 1 }, dependencies: [] }));
    expect(m.name).toBeUndefined();
    expect(m.scripts).toEqual({ ok: "x" });
    expect(m.dependencies).toEqual([]);
  });
});

describe("parseRequirementsTxt", () => {
  it("lida com comentários, extras, markers e opções", () => {
    const m = parseRequirementsTxt(
      ["# deps", "fastapi==0.110.0", "uvicorn[standard]>=0.29  # server", "-r dev.txt", "requests ; python_version > '3.8'", "", "--index-url https://x"].join("\n"),
    );
    expect(m.dependencies).toEqual([
      { name: "fastapi", version: "==0.110.0" },
      { name: "uvicorn", version: ">=0.29" },
      { name: "requests" },
    ]);
  });

  it("parsePep508 rejeita linhas inválidas", () => {
    expect(parsePep508("!!!")).toBeNull();
  });
});

describe("parsePyprojectToml", () => {
  it("lê [project] com dependências multilinha e requires-python", () => {
    const m = parsePyprojectToml(`
[project]
name = "acme-ml"  # nome
version = "0.3.0"
description = "Modelos # com hash na string"
requires-python = ">=3.11"
license = { text = "Apache-2.0" }
dependencies = [
  "pandas>=2.0",
  "scikit-learn",
]

[project.scripts]
acme = "acme.cli:main"

[tool.uv]
dev-dependencies = ["pytest"]
`);
    expect(m).toMatchObject({ name: "acme-ml", version: "0.3.0", description: "Modelos # com hash na string", packageManager: "uv", license: "Apache-2.0" });
    expect(m.engines).toEqual({ python: ">=3.11" });
    expect(m.dependencies.map((d) => d.name)).toEqual(["pandas", "scikit-learn"]);
    expect(m.scripts).toEqual({ acme: "acme.cli:main" });
  });

  it("lê projetos Poetry", () => {
    const m = parsePyprojectToml(`
[tool.poetry]
name = "svc"
version = "1.0.0"

[tool.poetry.dependencies]
python = "^3.12"
django = "^5.0"
celery = { version = "^5.3", extras = ["redis"] }

[tool.poetry.group.dev.dependencies]
pytest = "^8"
`);
    expect(m.packageManager).toBe("poetry");
    expect(m.dependencies).toEqual([
      { name: "django", version: "^5.0", dev: false },
      { name: "celery", version: "^5.3", dev: false },
      { name: "pytest", version: "^8", dev: true },
    ]);
  });
});

describe("parsePomXml", () => {
  const pom = `<?xml version="1.0"?>
<project>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.3.0</version></parent>
  <groupId>com.acme</groupId>
  <artifactId>billing</artifactId>
  <version>2.1.0</version>
  <name>Billing Service</name>
  <description>Faturamento</description>
  <properties><java.version>21</java.version></properties>
  <!-- <dependency><artifactId>commented</artifactId></dependency> -->
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.10.0</version><scope>test</scope></dependency>
  </dependencies>
</project>`;

  it("usa os campos do projeto, não do parent", () => {
    const m = parsePomXml(pom);
    expect(m).toMatchObject({ name: "Billing Service", version: "2.1.0", description: "Faturamento", packageManager: "maven", engines: { java: "21" } });
  });

  it("extrai dependências com escopo de teste e ignora comentários", () => {
    const m = parsePomXml(pom);
    expect(m.dependencies).toEqual([
      { name: "org.springframework.boot:spring-boot-starter-web", version: undefined, dev: false },
      { name: "org.junit.jupiter:junit-jupiter", version: "5.10.0", dev: true },
    ]);
  });
});

describe("outros ecossistemas", () => {
  it("parseGradle (Groovy e Kotlin DSL)", () => {
    const m = parseGradle(`dependencies {
  implementation 'org.springframework.boot:spring-boot-starter-web:3.3.0'
  testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
}`);
    expect(m.dependencies).toEqual([
      { name: "org.springframework.boot:spring-boot-starter-web", version: "3.3.0", dev: false },
      { name: "org.junit.jupiter:junit-jupiter", version: "5.10.0", dev: true },
    ]);
  });

  it("parseCargoToml", () => {
    const m = parseCargoToml(`[package]
name = "fastcli"
version = "0.2.0"
license = "MIT"

[dependencies]
tokio = { version = "1", features = ["full"] }
serde = "1.0"

[dev-dependencies]
insta = "1"`);
    expect(m).toMatchObject({ name: "fastcli", version: "0.2.0", license: "MIT" });
    expect(m.dependencies).toEqual([
      { name: "tokio", version: "1", dev: false },
      { name: "serde", version: "1.0", dev: false },
      { name: "insta", version: "1", dev: true },
    ]);
  });

  it("parseGoMod ignora dependências indiretas", () => {
    const m = parseGoMod(`module github.com/acme/gateway

go 1.22

require github.com/spf13/cobra v1.8.0

require (
\tgithub.com/gin-gonic/gin v1.10.0
\tgolang.org/x/net v0.25.0 // indirect
)`);
    expect(m).toMatchObject({ name: "gateway", engines: { go: "1.22" } });
    expect(m.dependencies.map((d) => d.name)).toEqual(["github.com/gin-gonic/gin", "github.com/spf13/cobra"]);
  });
});

describe("parseManifest", () => {
  it("retorna null para JSON malformado ou arquivo desconhecido", () => {
    expect(parseManifest("package.json", "{ nope")).toBeNull();
    expect(parseManifest("README.md", "# hi")).toBeNull();
  });

  it("é case-insensitive e respeita subpastas", () => {
    expect(parseManifest("crates/core/Cargo.toml", '[package]\nname = "core"')?.file).toBe("crates/core/Cargo.toml");
  });
});

describe("parseEnvExample", () => {
  it("retorna apenas nomes, nunca valores", () => {
    const names = parseEnvExample("API_KEY=sk-secret\n# X=1\nexport PORT=3000\n invalid line\nAPI_KEY=dup");
    expect(names).toEqual(["API_KEY", "PORT"]);
  });
});
