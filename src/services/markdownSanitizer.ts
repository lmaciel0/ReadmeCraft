import type { Blockquote, Paragraph, Root } from "mdast";
import { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import { visit } from "unist-util-visit";

/**
 * Schema de sanitização baseado no do GitHub (hast-util-sanitize/defaultSchema),
 * que já remove <script>, <style>, <iframe>, handlers `on*` e URLs `javascript:`.
 * Liberamos apenas o necessário para READMEs ricos: alinhamento, dimensões de
 * imagem, <picture>/<source> e classes de alerts/realce de sintaxe.
 */
const base = defaultSchema;
const baseAttrs = base.attributes ?? {};

export const sanitizeSchema: SanitizeSchema = {
  ...base,
  tagNames: [...(base.tagNames ?? []), "picture", "source", "center"],
  attributes: {
    ...baseAttrs,
    "*": [...(baseAttrs["*"] ?? []), "align"],
    img: [...(baseAttrs.img ?? []), "width", "height", "align", "loading"],
    source: ["srcSet", "media", "type", "width", "height"],
    div: [...(baseAttrs.div ?? []), ["className", /^markdown-alert/]],
    p: [...(baseAttrs.p ?? []), ["className", "markdown-alert-title"]],
    code: [...(baseAttrs.code ?? []), ["className", /^language-./]],
    span: [...(baseAttrs.span ?? []), ["className", /^hljs-/]],
  },
  protocols: {
    ...base.protocols,
    srcSet: ["http", "https"],
  },
};

export const ALERT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/i;

/**
 * Plugin remark que converte alerts do GitHub (`> [!NOTE]`) em
 * `<div class="markdown-alert markdown-alert-note">`, como o github.com renderiza.
 */
export function remarkGithubAlerts() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const first = node.children[0] as Paragraph | undefined;
      const text = first?.type === "paragraph" ? first.children[0] : undefined;
      if (!first || !text || text.type !== "text") return;
      const match = ALERT_RE.exec(text.value);
      if (!match) return;

      const type = match[1]!.toLowerCase() as AlertType;
      text.value = text.value.slice(match[0].length);
      if (!text.value) first.children.shift();
      if (first.children[0]?.type === "break") first.children.shift();
      if (first.children.length === 0) node.children.shift();

      const title: Paragraph = {
        type: "paragraph",
        data: { hProperties: { className: ["markdown-alert-title"] } },
        children: [{ type: "text", value: type.charAt(0).toUpperCase() + type.slice(1) }],
      };
      node.children.unshift(title);
      node.data = {
        ...node.data,
        hName: "div",
        hProperties: { className: ["markdown-alert", `markdown-alert-${type}`] },
      };
    });
  };
}

/** O sanitizador prefixa ids com `user-content-` (anti DOM clobbering); âncoras internas seguem o prefixo. */
export function resolveAnchor(href: string): string {
  if (!href.startsWith("#") || href.startsWith("#user-content-")) return href;
  let fragment = href.slice(1);
  try {
    // O markdown codifica acentos (%C3%A7); o id do heading (github-slugger) não.
    fragment = decodeURIComponent(fragment);
  } catch {
    // fragmento malformado: mantém como veio
  }
  return `#user-content-${fragment}`;
}
