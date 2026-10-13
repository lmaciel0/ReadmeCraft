import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "../../src/components/preview/MarkdownPreview";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, code: string) => {
      if (code.includes("INVALID")) throw new Error("Parse error on line 1");
      return { svg: `<svg data-testid="mermaid-svg"><text>${code.length}</text></svg>` };
    }),
  },
}));

const renderMd = (markdown: string) =>
  render(<MarkdownPreview markdown={markdown} theme="dark" />).container.querySelector("article") as HTMLElement;

describe("MarkdownPreview — GFM", () => {
  it("renderiza tabelas, checklists e strikethrough", () => {
    const c = renderMd("| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] feito\n- [ ] pendente\n\n~~velho~~");
    expect(c.querySelector("table")).not.toBeNull();
    expect(c.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(c.querySelector("del")?.textContent).toBe("velho");
  });

  it("aplica realce de sintaxe em blocos de código", () => {
    const c = renderMd("```ts\nconst x: number = 1;\n```");
    expect(c.querySelector("code.language-ts .hljs-keyword")).not.toBeNull();
  });

  it("converte alerts do GitHub", () => {
    const c = renderMd("> [!WARNING]\n> Cuidado com a chave.");
    const alert = c.querySelector(".markdown-alert.markdown-alert-warning");
    expect(alert).not.toBeNull();
    expect(alert?.querySelector(".markdown-alert-title")?.textContent).toBe("Warning");
    expect(alert?.textContent).toContain("Cuidado com a chave.");
  });

  it("mantém HTML seguro usado em READMEs (div centralizada, img com largura)", () => {
    const c = renderMd('<div align="center">\n\n<img src="https://x.dev/logo.png" width="120" alt="logo" />\n\n</div>');
    expect(c.querySelector('div[align="center"]')).not.toBeNull();
    expect(c.querySelector("img")?.getAttribute("width")).toBe("120");
  });

  it("não exibe os marcadores de seção (comentários HTML)", () => {
    const c = renderMd("<!-- rc:section=header -->\n# Título");
    expect(c.innerHTML).not.toContain("rc:section");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Título");
  });

  it("links externos abrem em nova aba com rel seguro e âncoras usam o prefixo", () => {
    // Mesmo slug do github.com (github-slugger mantém acentos).
    const c = renderMd("[site](https://example.com) [ir](#instalação)\n\n## Instalação");
    const [ext, anchor] = Array.from(c.querySelectorAll("a"));
    expect(ext).toHaveAttribute("target", "_blank");
    expect(ext?.getAttribute("rel")).toContain("noopener");
    expect(anchor).toHaveAttribute("href", "#user-content-instalação");
    expect(c.querySelector("h2")?.id).toBe("user-content-instalação");
  });
});

describe("MarkdownPreview — sanitização XSS", () => {
  const payloads = [
    "<script>window.__xss = 1</script>",
    '<img src="x" onerror="window.__xss = 1">',
    '<a href="javascript:window.__xss=1">clique</a>',
    "[md link](javascript:window.__xss=1)",
    '<iframe src="https://evil.com"></iframe>',
    '<svg><script>window.__xss=1</script></svg>',
    '<div style="background:url(javascript:alert(1))" onclick="x()">x</div>',
    '<form action="https://evil.com"><input name="password"></form>',
    '<object data="x.swf"></object><embed src="x.swf">',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<a href="JaVaScRiPt:alert(1)">caps</a>',
    '<img src="data:text/html;base64,PHNjcmlwdD4=">',
  ];

  it.each(payloads)("neutraliza %s", (payload) => {
    const c = renderMd(payload);
    expect(c.querySelector("script, iframe, object, embed, form, style")).toBeNull();
    const attrs = Array.from(c.querySelectorAll("*")).flatMap((el) => Array.from(el.attributes).map((a) => a.name.toLowerCase()));
    expect(attrs.filter((name) => name.startsWith("on"))).toEqual([]);
    const urls = Array.from(c.querySelectorAll("[href], [src]")).map((el) => (el.getAttribute("href") ?? el.getAttribute("src") ?? "").toLowerCase());
    expect(urls.some((u) => u.startsWith("javascript:"))).toBe(false);
    expect(urls.some((u) => u.startsWith("data:text/html"))).toBe(false);
    expect(c.querySelector("[style]")).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it("prefixa ids/names para evitar DOM clobbering", () => {
    const c = renderMd('<a id="location" name="cookie">x</a>');
    expect(c.querySelector("#location")).toBeNull();
  });
});

describe("MarkdownPreview — Mermaid", () => {
  it("renderiza diagramas válidos como SVG", async () => {
    renderMd("```mermaid\nflowchart TD\n  A --> B\n```");
    expect(await screen.findByTestId("mermaid-svg")).toBeInTheDocument();
  });

  it("mostra o código e o erro quando o diagrama é inválido", async () => {
    const c = renderMd("```mermaid\nINVALID\n```");
    await waitFor(() => expect(c.textContent).toContain("Parse error on line 1"));
    expect(c.querySelector("pre code")?.textContent).toBe("INVALID");
  });
});

describe("MarkdownPreview — assets locais", () => {
  it("resolve ./assets/banner.svg para o SVG gerado", () => {
    const c = render(<MarkdownPreview markdown={'<img src="./assets/banner.svg" alt="banner" />'} theme="dark" assets={{ "assets/banner.svg": "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E" }} />).container;
    expect(c.querySelector("img")?.getAttribute("src")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
  });

  it("não deixa o markdown injetar data: URLs por conta própria", () => {
    const c = render(<MarkdownPreview markdown={'<img src="data:image/svg+xml,%3Csvg%2F%3E" alt="x" />'} theme="dark" assets={{}} />).container;
    expect(c.querySelector("img")?.getAttribute("src") ?? "").not.toContain("data:");
  });
});
