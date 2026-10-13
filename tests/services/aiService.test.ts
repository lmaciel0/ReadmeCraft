import { describe, expect, it, vi } from "vitest";
import { ApiError, analyzeRepo, streamGenerate, stripErrorMarker } from "../../src/services/aiService";
import { defaultOptions, makeNodeMetadata } from "../fixtures/metadata";

function streamResponse(chunks: string[], headers: Record<string, string> = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers });
}

describe("streamGenerate", () => {
  it("acumula os blocos e reporta o texto parcial a cada chunk", async () => {
    const onText = vi.fn();
    const fetchImpl = vi.fn(async () => streamResponse(["# Tí", "tulo\n", "texto"], { "X-Generator-Engine": "claude" }));
    const result = await streamGenerate({ metadata: makeNodeMetadata(), options: defaultOptions, onText, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(onText.mock.calls.map((c) => c[0])).toEqual(["# Tí", "# Título\n", "# Título\ntexto"]);
    expect(result).toEqual({ text: "# Título\ntexto\n", engine: "claude" });
  });

  it("transforma o marcador de erro do servidor em exceção, sem vazar o marcador no texto", async () => {
    const onText = vi.fn();
    const fetchImpl = vi.fn(async () => streamResponse(["parcial", `\n\n<!-- rc:error=${encodeURIComponent("API indisponível")} -->`]));
    await expect(streamGenerate({ metadata: makeNodeMetadata(), options: defaultOptions, onText, fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow("API indisponível");
    expect(onText.mock.calls.at(-1)?.[0]).toBe("parcial");
  });

  it("propaga o erro JSON de respostas não-OK", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Muitas requisições." }), { status: 429 }));
    const err = await streamGenerate({ metadata: makeNodeMetadata(), options: defaultOptions, onText: () => {}, fetchImpl: fetchImpl as unknown as typeof fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, message: "Muitas requisições." });
  });
});

describe("analyzeRepo", () => {
  it("envia a URL e devolve os metadados", async () => {
    const meta = makeNodeMetadata();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ metadata: meta })));
    await expect(analyzeRepo("acme/acme-api", undefined, fetchImpl as unknown as typeof fetch)).resolves.toEqual(meta);
    expect(fetchImpl).toHaveBeenCalledWith("/api/repo/analyze", expect.objectContaining({ method: "POST", body: JSON.stringify({ url: "acme/acme-api" }) }));
  });
});

describe("stripErrorMarker", () => {
  it("lida com marcador malformado", () => {
    expect(stripErrorMarker("ok <!-- rc:error=%E0%A4%A -->")).toEqual({ text: "ok", error: "Falha ao gerar o README." });
    expect(stripErrorMarker("sem erro")).toEqual({ text: "sem erro" });
  });
});
