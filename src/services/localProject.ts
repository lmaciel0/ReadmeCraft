import type { RepoMetadata, TreeEntry } from "../types/github";
import { isManifestFile } from "./manifestParsers";
import { buildMetadata, filterTree, parseTreeText } from "./metadataBuilder";

export interface ManualFile {
  path: string;
  content: string;
}

export interface ManualProjectInput {
  name: string;
  description?: string;
  treeText: string;
  files: ManualFile[];
}

/** Valida e converte o formulário do modo manual em metadados. */
export function buildManualMetadata(input: ManualProjectInput): RepoMetadata {
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do projeto.");
  const tree = parseTreeText(input.treeText);
  const known = new Set(tree.map((t) => t.path));
  const files: Record<string, string> = {};
  for (const f of input.files) {
    const path = f.path.trim().replace(/^\.\//, "");
    if (!path || !f.content.trim()) continue;
    files[path] = f.content;
    if (!known.has(path)) {
      tree.push({ path, type: "file" });
      known.add(path);
    }
  }
  const meta = buildMetadata({ source: "manual", name, tree, files });
  const description = input.description?.trim();
  return description ? { ...meta, description } : meta;
}

const MAX_READ_BYTES = 256_000;
const ENV_EXAMPLE_RE = /^\.env\.(example|sample|template)$/i;

/**
 * Lê uma pasta escolhida com `<input webkitdirectory>` inteiramente no navegador.
 * Apenas manifestos e `.env.example` são lidos; o restante vira só a árvore.
 */
export async function readLocalFolder(fileList: FileList | File[]): Promise<RepoMetadata> {
  const all = Array.from(fileList);
  if (!all.length) throw new Error("Nenhum arquivo selecionado.");
  const first = (all[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? all[0]!.name;
  const rootName = first.includes("/") ? first.split("/")[0]! : "projeto";

  const entries: { path: string; file: File }[] = all.map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    return { path: rel.startsWith(`${rootName}/`) ? rel.slice(rootName.length + 1) : rel, file };
  });

  const treeFiles: TreeEntry[] = filterTree(entries.map((e) => ({ path: e.path, type: "file" as const, size: e.file.size })));
  const kept = new Set(treeFiles.map((t) => t.path));
  const dirs = new Set<string>();
  for (const t of treeFiles) {
    const parts = t.path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }

  const files: Record<string, string> = {};
  await Promise.all(
    entries
      .filter((e) => kept.has(e.path) && e.file.size <= MAX_READ_BYTES)
      .filter((e) => (isManifestFile(e.path) && e.path.split("/").length <= 3) || ENV_EXAMPLE_RE.test(e.path))
      .sort((a, b) => a.path.split("/").length - b.path.split("/").length)
      .slice(0, 12)
      .map(async (e) => {
        files[e.path] = await e.file.text();
      }),
  );

  return buildMetadata({
    source: "manual",
    name: rootName,
    tree: [...[...dirs].map((path) => ({ path, type: "dir" as const })), ...treeFiles],
    files,
  });
}
