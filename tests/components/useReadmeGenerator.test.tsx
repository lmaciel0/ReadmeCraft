import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReadmeGenerator } from "../../src/hooks/useReadmeGenerator";
import { sectionMarker } from "../../src/lib/sections";
import { defaultOptions, makeNodeMetadata } from "../fixtures/metadata";

const BASE = `${sectionMarker("header")}\n# App\n\n${sectionMarker("license")}\n## Licença\nMIT\n`;

/** Resposta em stream que envia `first` e fica pendurada até o abort. */
function hangingStream(first: string) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(first));
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
      },
    });
    return new Response(body, { headers: { "X-Generator-Engine": "claude" } });
  });
}

function setup() {
  return renderHook(() => {
    const [markdown, setMarkdown] = useState(BASE);
    const [onError] = useState(() => vi.fn());
    return { markdown, onError, gen: useReadmeGenerator({ markdown, setMarkdown, onError }) };
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("useReadmeGenerator", () => {
  it("parar a regeneração de seção restaura o conteúdo original", async () => {
    vi.stubGlobal("fetch", hangingStream(`${sectionMarker("license")}\n## Licença\nparcial`));
    const { result } = setup();
    act(() => void result.current.gen.regenerateSection(makeNodeMetadata(), defaultOptions, "license"));
    await waitFor(() => expect(result.current.markdown).toContain("parcial"));
    act(() => result.current.gen.cancel());
    await waitFor(() => expect(result.current.gen.state.status).toBe("idle"));
    expect(result.current.markdown).toBe(BASE);
  });

  it("uma execução substituída não derruba o estado da nova", async () => {
    vi.stubGlobal("fetch", hangingStream("# Nova"));
    const { result } = setup();
    act(() => void result.current.gen.regenerateSection(makeNodeMetadata(), defaultOptions, "license"));
    act(() => void result.current.gen.generate(makeNodeMetadata(), defaultOptions));
    await waitFor(() => expect(result.current.markdown).toBe("# Nova"));
    expect(result.current.gen.state).toEqual({ status: "streaming", section: null });
    act(() => result.current.gen.cancel());
    await waitFor(() => expect(result.current.gen.state.status).toBe("idle"));
  });

  it("erro do servidor restaura o rascunho e notifica", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "API indisponível" }), { status: 502 })));
    const { result } = setup();
    await act(() => result.current.gen.generate(makeNodeMetadata(), defaultOptions));
    expect(result.current.gen.state).toEqual({ status: "error", error: "API indisponível" });
    expect(result.current.markdown).toBe(BASE);
    expect(result.current.onError).toHaveBeenCalledWith("API indisponível");
  });
});
