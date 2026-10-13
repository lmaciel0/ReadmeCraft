import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Header } from "../../src/components/layout/Header";
import type { TemplateId } from "../../src/types/template";

function HeaderHarness() {
  const [template, setTemplate] = useState<TemplateId>("showcase");
  return <Header template={template} onTemplateChange={setTemplate} health={{ status: "offline" }} theme="dark" onToggleTheme={() => {}} />;
}

describe("navegação por setas (WAI-ARIA)", () => {
  it("move seleção e foco no seletor de templates, com Tab só no item ativo", async () => {
    const user = userEvent.setup();
    render(<HeaderHarness />);
    const showcase = screen.getByRole("radio", { name: /Showcase/ });
    expect(showcase).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /Minimalist/ })).toHaveAttribute("tabindex", "-1");

    showcase.focus();
    await user.keyboard("{ArrowRight}");
    const enterprise = screen.getByRole("radio", { name: /Enterprise/ });
    expect(enterprise).toHaveAttribute("aria-checked", "true");
    expect(enterprise).toHaveFocus();

    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: /Open Source/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Minimalist/ })).toHaveAttribute("aria-checked", "true");
  });
});
