import type { TreeEntry } from "../types/github";

interface Node {
  name: string;
  dir: boolean;
  children: Map<string, Node>;
}

function buildNodes(entries: TreeEntry[]): Node {
  const root: Node = { name: "", dir: true, children: new Map() };
  for (const entry of entries) {
    const parts = entry.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, dir: !isLast || entry.type === "dir", children: new Map() };
        node.children.set(part, child);
      }
      if (!isLast) child.dir = true;
      node = child;
    });
  }
  return root;
}

export interface AsciiTreeOptions {
  maxDepth?: number;
  maxChildren?: number;
  rootName?: string;
}

/** Renderiza a árvore no estilo do comando `tree`, com limites de profundidade e largura. */
export function renderAsciiTree(entries: TreeEntry[], { maxDepth = 3, maxChildren = 12, rootName = "." }: AsciiTreeOptions = {}): string {
  const lines = [rootName.endsWith("/") ? rootName : `${rootName}/`];
  const walk = (node: Node, prefix: string, depth: number) => {
    const children = [...node.children.values()].sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    const shown = children.slice(0, maxChildren);
    shown.forEach((child, i) => {
      const last = i === shown.length - 1 && children.length <= maxChildren;
      lines.push(`${prefix}${last ? "└── " : "├── "}${child.name}${child.dir ? "/" : ""}`);
      if (child.dir && depth + 1 < maxDepth) walk(child, `${prefix}${last ? "    " : "│   "}`, depth + 1);
    });
    if (children.length > maxChildren) lines.push(`${prefix}└── … (+${children.length - maxChildren})`);
  };
  walk(buildNodes(entries), "", 0);
  return lines.join("\n");
}

/** Diretórios de primeiro nível com contagem de arquivos (usado para diagramas). */
export function topLevelDirs(entries: TreeEntry[]): { name: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const [first, ...rest] = e.path.split("/");
    if (!first || first.startsWith(".")) continue;
    if (rest.length === 0 && e.type === "file") continue;
    if (!counts.has(first)) counts.set(first, 0);
    if (e.type === "file") counts.set(first, counts.get(first)! + 1);
  }
  return [...counts.entries()].map(([name, files]) => ({ name, files })).sort((a, b) => b.files - a.files);
}
