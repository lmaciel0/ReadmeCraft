import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SectionManager, type EditableOptions } from "../../src/components/editor/SectionManager";

const options: EditableOptions = { template: "minimalist", sections: ["header", "installation"], tone: "professional", language: "pt-BR", includeEmoji: false };

function setup(over: Partial<Parameters<typeof SectionManager>[0]> = {}) {
  const props = {
    options,
    onChange: vi.fn(),
    onGenerate: vi.fn(),
    onRegenerateSection: vi.fn(),
    canGenerate: true,
    streaming: false,
    streamingSection: null,
    presentSections: ["installation" as const],
    aiEnabled: true,
    ...over,
  };
  render(<SectionManager {...props} />);
  return { ...props, user: userEvent.setup() };
}

describe("SectionManager", () => {
  it("ativa seções mantendo a ordem canônica", async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByLabelText(/^Badges/));
    expect(onChange).toHaveBeenCalledWith({ ...options, sections: ["header", "badges", "installation"] });
  });

  it("não permite desligar seção obrigatória", () => {
    setup();
    expect(screen.getByLabelText(/^Título e descrição/)).toBeDisabled();
  });

  it("regenera apenas seções presentes no README", async () => {
    const { onRegenerateSection, user } = setup();
    expect(screen.getByRole("button", { name: "Regenerar seção Título e descrição" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Regenerar seção Instalação" }));
    expect(onRegenerateSection).toHaveBeenCalledWith("installation");
  });

  it("botão de gerar reflete o modo e o estado", async () => {
    const { onGenerate, user } = setup({ aiEnabled: false });
    await user.click(screen.getByRole("button", { name: "Gerar README (templates)" }));
    expect(onGenerate).toHaveBeenCalled();
  });

  it("desabilita a geração sem repositório", () => {
    setup({ canGenerate: false });
    expect(screen.getByRole("button", { name: /Gerar README/ })).toBeDisabled();
  });
});
