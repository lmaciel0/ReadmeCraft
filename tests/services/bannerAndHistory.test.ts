import { describe, expect, it } from "vitest";
import { bannerMarkdown, buildBannerSvg, escapeXml, svgDataUrl } from "../../src/services/bannerGenerator";
import { HISTORY_KEY, createLocalHistory } from "../../src/services/historyStore";

describe("bannerGenerator", () => {
  it("gera SVG válido com título, tagline e chips", () => {
    const svg = buildBannerSvg({ title: "acme-api", tagline: "API de pedidos", techs: ["React", "Node.js"], variant: "showcase" });
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    const texts = Array.from(doc.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toEqual(["acme-api", "API de pedidos", "React", "Node.js"]);
    expect(doc.querySelector("linearGradient")).not.toBeNull();
  });

  it("escapa texto controlado pelo usuário (sem injeção de markup no SVG)", () => {
    const svg = buildBannerSvg({ title: '<script>alert(1)</script>', tagline: 'a" onload="x', variant: "enterprise" });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain('" onload="');
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("trunca textos longos e limita chips a 6", () => {
    const svg = buildBannerSvg({ title: "x".repeat(80), tagline: "y".repeat(200), techs: Array.from({ length: 10 }, (_, i) => `t${i}`), variant: "minimalist" });
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelectorAll("rect[rx]")).toHaveLength(6);
    expect(doc.querySelector("text")?.textContent?.length).toBeLessThanOrEqual(32);
  });

  it("gera data URL e trecho de README com caminho relativo", () => {
    expect(svgDataUrl("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
    expect(bannerMarkdown('Meu "app"')).toContain('src="./assets/banner.svg" alt="Meu &quot;app&quot;"');
  });
});

function memoryStorage(quotaChars = Infinity): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => {
      if (v.length > quotaChars) throw new DOMException("quota", "QuotaExceededError");
      data.set(k, v);
    },
  };
}

const entry = (markdown: string) => ({ title: "app", template: "showcase" as const, origin: "claude" as const, markdown });

describe("historyStore (local)", () => {
  it("salva em ordem decrescente, ignora duplicata consecutiva e vazio", () => {
    let t = 0;
    const repo = createLocalHistory({ storage: memoryStorage(), now: () => ++t, newId: () => `id${t}` });
    expect(repo.save(entry("# v1"))).not.toBeNull();
    expect(repo.save(entry("# v1"))).toBeNull();
    expect(repo.save(entry("   "))).toBeNull();
    repo.save(entry("# v2"));
    expect(repo.list().map((e) => e.markdown)).toEqual(["# v2", "# v1"]);
  });

  it("mantém no máximo `max` versões", () => {
    let t = 0;
    const repo = createLocalHistory({ storage: memoryStorage(), max: 3, now: () => ++t });
    for (let i = 0; i < 5; i++) repo.save(entry(`# v${i}`));
    expect(repo.list().map((e) => e.markdown)).toEqual(["# v4", "# v3", "# v2"]);
  });

  it("remove e limpa", () => {
    const repo = createLocalHistory({ storage: memoryStorage() });
    const a = repo.save(entry("a"))!;
    repo.save(entry("b"));
    repo.remove(a.id);
    expect(repo.list().map((e) => e.markdown)).toEqual(["b"]);
    repo.clear();
    expect(repo.list()).toEqual([]);
  });

  it("descarta versões antigas quando a cota do storage estoura", () => {
    let t = 0;
    const repo = createLocalHistory({ storage: memoryStorage(700), now: () => ++t });
    for (let i = 0; i < 6; i++) repo.save(entry(`# versão ${i} ${"x".repeat(100)}`));
    const list = repo.list();
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThan(6);
    expect(list[0]!.markdown).toContain("versão 5");
  });

  it("ignora dados corrompidos no storage", () => {
    const storage = memoryStorage();
    storage.setItem(HISTORY_KEY, '[{"id":1},"lixo",{"id":"ok","createdAt":1,"title":"t","markdown":"m","template":"showcase","origin":"manual"}]');
    expect(createLocalHistory({ storage }).list().map((e) => e.id)).toEqual(["ok"]);
    storage.setItem(HISTORY_KEY, "{nao-json");
    expect(createLocalHistory({ storage }).list()).toEqual([]);
  });

  it("funciona em memória quando não há storage", () => {
    const repo = createLocalHistory({ storage: null });
    repo.save(entry("# mem"));
    expect(repo.list()).toHaveLength(1);
  });
});

describe("historyStore (remoto)", () => {
  it("lista, evita duplicata consecutiva e repassa erros do servidor", async () => {
    const { createRemoteHistory } = await import("../../src/services/historyStore");
    const calls: { url: string; method: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      if (url === "/api/history" && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify({ entries: [{ id: "1", markdown: "# a", createdAt: 1, title: "t", template: "showcase", origin: "claude" }] }));
      if (url === "/api/history" && init?.method === "POST") return new Response(JSON.stringify({ entry: { id: "2", markdown: "# b", createdAt: 2, title: "t", template: "showcase", origin: "manual" } }), { status: 201 });
      return new Response(JSON.stringify({ error: "Falha ao acessar o histórico." }), { status: 502 });
    }) as unknown as typeof fetch;
    const repo = createRemoteHistory(fetchImpl);
    expect(await repo.list()).toHaveLength(1);
    expect(await repo.save(entry("# a"))).toBeNull();
    expect((await repo.save(entry("# b")))?.id).toBe("2");
    await expect(repo.remove("1")).rejects.toThrow("Falha ao acessar o histórico.");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});
