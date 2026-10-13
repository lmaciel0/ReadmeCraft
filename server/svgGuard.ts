/**
 * Valida o banner SVG recebido do cliente antes de commitá-lo no repositório do usuário.
 * O banner legítimo (`buildBannerSvg`) usa um conjunto pequeno de elementos gráficos e só
 * referências internas (`url(#id)`). Em vez de procurar padrões perigosos no texto (burlável),
 * o SVG é tokenizado e só passa o que está na lista de elementos e atributos permitidos.
 */
const ALLOWED_TAGS = new Set([
  "svg", "defs", "linearGradient", "radialGradient", "stop", "rect", "circle", "ellipse",
  "line", "path", "polygon", "polyline", "g", "text", "tspan", "title", "desc",
]);

// Elemento bem-formado: atributos sempre entre aspas e sem "<" no valor.
const TAG = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
const ATTR = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const BLOCKED_ATTR = /^(?:on|href$|xlink:href$|style$|src$)/i;
const BLOCKED_VALUE = /javascript\s*:|data\s*:|expression\s*\(|@import|url\(\s*["']?\s*(?!#)/i;

/** Decodifica entidades numéricas: `u&#114;l(` vira `url(` e não pode escapar da checagem. */
function decodeEntities(value: string): string {
  const code = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => code(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => code(parseInt(d, 10)));
}

export function isSafeSvg(svg: string): boolean {
  const text = svg.trim();
  if (!text.startsWith("<svg") || !text.endsWith(">")) return false;

  let depth = 0;
  let sawRoot = false;
  for (let i = text.indexOf("<"); i !== -1; i = text.indexOf("<", TAG.lastIndex)) {
    TAG.lastIndex = i;
    const m = TAG.exec(text);
    if (!m) return false; // comentário, CDATA, DOCTYPE, instrução <? ou marcação malformada
    const [, closing, name, attrs, selfClosing] = m;
    if (!ALLOWED_TAGS.has(name!)) return false;

    if (closing) {
      if (attrs!.trim() || selfClosing) return false;
      if (--depth < 0) return false;
      continue;
    }
    if (name === "svg") {
      if (sawRoot) return false;
      sawRoot = true;
    } else if (!sawRoot || depth === 0) {
      return false; // elemento fora da raiz <svg>
    }
    for (const a of attrs!.matchAll(ATTR)) {
      const attrName = a[1]!;
      if (/^xmlns(?::|$)/i.test(attrName)) continue;
      if (BLOCKED_ATTR.test(attrName)) return false;
      const value = a[2] ?? a[3] ?? "";
      if (BLOCKED_VALUE.test(value) || BLOCKED_VALUE.test(decodeEntities(value))) return false;
    }
    if (!selfClosing) depth++;
    if (depth === 0 && sawRoot) {
      // `<svg/>` autofechado: nada pode vir depois.
      return text.slice(TAG.lastIndex).trim() === "";
    }
  }
  return sawRoot && depth === 0 && text.endsWith("</svg>");
}
