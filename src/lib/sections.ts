import { SECTION_IDS } from "../types/readme";
import type { SectionId } from "../types/template";

/**
 * Cada seção gerada começa com um comentário HTML invisível no GitHub:
 * `<!-- rc:section=installation -->`. Isso permite regenerar uma seção
 * isolada sem depender de títulos (que o usuário pode editar livremente).
 */
export const sectionMarker = (id: SectionId) => `<!-- rc:section=${id} -->`;

const MARKER_RE = /^<!-- rc:section=([A-Za-z]+) -->[ \t]*$/gm;

export interface MarkdownChunk {
  id: SectionId | null;
  content: string;
}

function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

/** Divide o markdown nos marcadores de seção. O trecho antes do primeiro marcador tem `id: null`. */
export function splitSections(markdown: string): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = [];
  const fences = fencedRanges(markdown);
  const matches = [...markdown.matchAll(MARKER_RE)].filter(
    (m) => isSectionId(m[1]!) && !fences.some(([start, end]) => m.index >= start && m.index < end),
  );
  if (matches.length === 0) return [{ id: null, content: markdown }];

  const head = markdown.slice(0, matches[0]!.index);
  if (head.trim()) chunks.push({ id: null, content: head });
  matches.forEach((m, i) => {
    const end = i + 1 < matches.length ? matches[i + 1]!.index : markdown.length;
    chunks.push({ id: m[1] as SectionId, content: markdown.slice(m.index, end) });
  });
  return chunks;
}

/** Intervalos [início, fim) de blocos de código cercados (``` ou ~~~), onde marcadores são só texto. */
function fencedRanges(markdown: string): [number, number][] {
  const ranges: [number, number][] = [];
  let open: { char: string; len: number; start: number } | null = null;
  let offset = 0;
  for (const line of markdown.split("\n")) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const char = fence[1]![0]!;
      const len = fence[1]!.length;
      if (!open) open = { char, len, start: offset };
      else if (char === open.char && len >= open.len && line.trim() === fence[1]) {
        ranges.push([open.start, offset + line.length]);
        open = null;
      }
    }
    offset += line.length + 1;
  }
  if (open) ranges.push([open.start, markdown.length]);
  return ranges;
}

export function listSectionIds(markdown: string): SectionId[] {
  return splitSections(markdown)
    .map((c) => c.id)
    .filter((id): id is SectionId => id !== null);
}

/** Garante que o bloco começa com o marcador correto e termina com linha em branco. */
export function normalizeSectionBlock(id: SectionId, block: string): string {
  const body = block.replace(MARKER_RE, "").trim();
  return `${sectionMarker(id)}\n${body}\n\n`;
}

/**
 * Substitui o conteúdo da seção `id`. Se ela ainda não existe, o bloco é anexado
 * ao final (antes da licença, quando houver, para manter a ordem convencional).
 */
export function replaceSection(markdown: string, id: SectionId, newBlock: string): string {
  const block = normalizeSectionBlock(id, newBlock);
  const chunks = splitSections(markdown);
  const idx = chunks.findIndex((c) => c.id === id);
  if (idx >= 0) {
    chunks[idx] = { id, content: block };
  } else {
    const licenseIdx = chunks.findIndex((c) => c.id === "license");
    const insertAt = licenseIdx >= 0 ? licenseIdx : chunks.length;
    const prev = chunks[insertAt - 1];
    if (prev && !prev.content.endsWith("\n\n")) prev.content = prev.content.replace(/\n*$/, "\n\n");
    chunks.splice(insertAt, 0, { id, content: block });
  }
  return chunks.map((c) => c.content).join("");
}
