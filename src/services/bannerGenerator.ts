import type { TemplateId } from "../types/template";

export const BANNER_PATH = "./assets/banner.svg";
export const BANNER_WIDTH = 1280;
export const BANNER_HEIGHT = 320;

export interface BannerInput {
  title: string;
  tagline?: string;
  techs?: string[];
  variant: TemplateId;
}

interface Palette {
  background: string;
  title: string;
  tagline: string;
  chipFill: string;
  chipText: string;
  accent: string;
  font: string;
}

const SANS = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

const PALETTES: Record<TemplateId, Palette> = {
  showcase: {
    background: "url(#bg)",
    title: "#ffffff",
    tagline: "#e9e5ff",
    chipFill: "rgba(255,255,255,0.16)",
    chipText: "#ffffff",
    accent: "#22d3ee",
    font: SANS,
  },
  minimalist: {
    background: "#fafafa",
    title: "#111111",
    tagline: "#555555",
    chipFill: "#ececec",
    chipText: "#222222",
    accent: "#111111",
    font: MONO,
  },
  enterprise: {
    background: "#0d1117",
    title: "#f0f6fc",
    tagline: "#9198a1",
    chipFill: "#1f2937",
    chipText: "#c9d1d9",
    accent: "#2f81f7",
    font: SANS,
  },
  opensource: {
    background: "url(#bg)",
    title: "#ffffff",
    tagline: "#d2f4dc",
    chipFill: "rgba(255,255,255,0.18)",
    chipText: "#ffffff",
    accent: "#ffd33d",
    font: SANS,
  },
};

const GRADIENTS: Partial<Record<TemplateId, [string, string]>> = {
  showcase: ["#6a4cff", "#0891b2"],
  opensource: ["#0f5132", "#2ea043"],
};

/** Escapa texto para uso seguro em conteúdo e atributos XML. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Gera um banner SVG autocontido (sem fontes ou imagens externas), pronto para
 * ser salvo em `assets/banner.svg` e referenciado no README.
 */
export function buildBannerSvg({ title, tagline, techs = [], variant }: BannerInput): string {
  const p = PALETTES[variant];
  const gradient = GRADIENTS[variant];
  const safeTitle = escapeXml(truncate(title || "Meu projeto", 32));
  const titleSize = safeTitle.length > 20 ? 56 : 72;
  const safeTagline = tagline ? escapeXml(truncate(tagline, 90)) : "";
  const cx = BANNER_WIDTH / 2;

  // Chips centralizados: largura estimada pelo número de caracteres.
  const chips = techs.slice(0, 6).map((t) => truncate(t, 18));
  const widths = chips.map((c) => Math.round(c.length * 9.5 + 32));
  const gap = 12;
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, chips.length - 1);
  let x = cx - total / 2;
  const chipY = safeTagline ? 236 : 210;
  const chipSvg = chips
    .map((c, i) => {
      const w = widths[i]!;
      const el = `<g><rect x="${x.toFixed(1)}" y="${chipY}" width="${w}" height="34" rx="17" fill="${p.chipFill}"/><text x="${(x + w / 2).toFixed(1)}" y="${chipY + 22}" text-anchor="middle" font-size="15" font-weight="500" fill="${p.chipText}">${escapeXml(c)}</text></g>`;
      x += w + gap;
      return el;
    })
    .join("");

  const defs = gradient
    ? `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${gradient[0]}"/><stop offset="1" stop-color="${gradient[1]}"/></linearGradient></defs>`
    : "";
  const decoration =
    variant === "enterprise"
      ? `<rect x="0" y="0" width="${BANNER_WIDTH}" height="6" fill="${p.accent}"/>`
      : variant === "minimalist"
        ? `<line x1="${cx - 40}" y1="${safeTagline ? 196 : 170}" x2="${cx + 40}" y2="${safeTagline ? 196 : 170}" stroke="${p.accent}" stroke-width="2"/>`
        : `<circle cx="${BANNER_WIDTH - 90}" cy="70" r="140" fill="#ffffff" opacity="0.06"/><circle cx="80" cy="${BANNER_HEIGHT - 30}" r="110" fill="#ffffff" opacity="0.05"/>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" viewBox="0 0 ${BANNER_WIDTH} ${BANNER_HEIGHT}" role="img" aria-label="${safeTitle}">`,
    defs,
    `<rect width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" fill="${p.background}"/>`,
    decoration,
    `<g font-family="${p.font}">`,
    `<text x="${cx}" y="${safeTagline ? 128 : 150}" text-anchor="middle" font-size="${titleSize}" font-weight="700" fill="${p.title}">${safeTitle}</text>`,
    safeTagline ? `<text x="${cx}" y="178" text-anchor="middle" font-size="24" fill="${p.tagline}">${safeTagline}</text>` : "",
    chipSvg,
    `</g>`,
    `</svg>`,
  ].join("");
}

/** URL `data:` para pré-visualizar o SVG no navegador. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Trecho de README que exibe o banner centralizado. */
export function bannerMarkdown(alt: string): string {
  return `<p align="center">\n  <img src="${BANNER_PATH}" alt="${escapeXml(alt)}" width="100%" />\n</p>\n`;
}
