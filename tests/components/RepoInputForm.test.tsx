import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepoInput } from "../../src/components/repository/RepoInput";

function setup(props: Partial<Parameters<typeof RepoInput>[0]> = {}) {
  const onAnalyze = vi.fn();
  const onManual = vi.fn();
  render(<RepoInput loading={false} error={null} onAnalyze={onAnalyze} onManual={onManual} {...props} />);
  return { onAnalyze, onManual, user: userEvent.setup() };
}

describe("RepoInput — modo GitHub", () => {
  it("desabilita o botão com campo vazio", () => {
    setup();
    expect(screen.getByRole("button", { name: "Analisar" })).toBeDisabled();
  });

  it("valida a URL e não chama onAnalyze quando inválida", async () => {
    const { onAnalyze, user } = setup();
    const input = screen.getByLabelText("URL do repositório no GitHub");
    await user.type(input, "https://gitlab.com/a/b");
    await user.click(screen.getByRole("button", { name: "Analisar" }));
    expect(onAnalyze).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("URL inválida");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("envia URLs válidas (com Enter)", async () => {
    const { onAnalyze, user } = setup();
    await user.type(screen.getByLabelText("URL do repositório no GitHub"), "github.com/honojs/hono{Enter}");
    expect(onAnalyze).toHaveBeenCalledWith("github.com/honojs/hono");
  });

  it("os exemplos analisam imediatamente", async () => {
    const { onAnalyze, user } = setup();
    await user.click(screen.getByRole("button", { name: "pmndrs/zustand" }));
    expect(onAnalyze).toHaveBeenCalledWith("https://github.com/pmndrs/zustand");
  });

  it("exibe erro vindo do servidor e estado de carregamento", () => {
    setup({ error: "Repositório não encontrado", loading: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Repositório não encontrado");
    expect(screen.getByRole("button", { name: "Analisar" })).toHaveAttribute("aria-busy", "true");
  });
});

describe("RepoInput — modo manual", () => {
  it("exige nome do projeto", async () => {
    const { onManual, user } = setup();
    await user.click(screen.getByRole("tab", { name: "Local / Manual" }));
    await user.click(screen.getByRole("button", { name: "Usar estes dados" }));
    expect(onManual).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Informe o nome do projeto");
  });

  it("monta metadados a partir da árvore e do manifesto colados", async () => {
    const { onManual, user } = setup();
    await user.click(screen.getByRole("tab", { name: "Local / Manual" }));
    await user.type(screen.getByLabelText("Nome do projeto *"), "meu-app");
    await user.type(screen.getByLabelText(/Árvore de arquivos/), "src/main.tsx\nDockerfile");
    const content = screen.getByLabelText("Conteúdo de package.json");
    await user.click(content);
    await user.paste(JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "19.0.0" } }));
    await user.click(screen.getByRole("button", { name: "Usar estes dados" }));

    expect(onManual).toHaveBeenCalledTimes(1);
    const meta = onManual.mock.calls[0]![0];
    expect(meta).toMatchObject({ source: "manual", name: "meu-app" });
    expect(meta.techStack.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(["React", "Docker"]));
    expect(meta.manifests[0].scripts).toEqual({ dev: "vite" });
  });
});
