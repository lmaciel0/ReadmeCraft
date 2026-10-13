import { useId, useRef, useState, type FormEvent } from "react";
import { FolderOpen, GitBranch, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { arrowNav, rovingTabIndex } from "../../lib/a11y";
import { cn } from "../../lib/cn";
import { parseGithubUrl } from "../../services/githubService";
import { buildManualMetadata, readLocalFolder, type ManualFile } from "../../services/localProject";
import type { RepoMetadata } from "../../types/github";
import { Button } from "../common/Button";
import { Card } from "../common/Card";

const MODES = ["github", "manual"] as const;
type Mode = (typeof MODES)[number];

interface Props {
  loading: boolean;
  error: string | null;
  onAnalyze: (url: string) => void;
  onManual: (metadata: RepoMetadata) => void;
}

const EXAMPLES = ["honojs/hono", "pmndrs/zustand", "fastapi/full-stack-fastapi-template"];
const MANIFEST_OPTIONS = ["package.json", "requirements.txt", "pyproject.toml", "pom.xml", "build.gradle", "Cargo.toml", "go.mod", "composer.json", "Gemfile", ".env.example"];

export function RepoInput({ loading, error, onAnalyze, onManual }: Props) {
  const [mode, setMode] = useState<Mode>("github");
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const urlId = useId();
  const errorId = useId();
  const invalid = touched && url.trim() !== "" && !parseGithubUrl(url);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (parseGithubUrl(url)) onAnalyze(url.trim());
  };

  return (
    <Card title="Repositório" icon={<GitBranch className="size-4" />}>
      <div
        role="tablist"
        aria-label="Modo de entrada"
        className="mb-4 grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-sm"
        onKeyDown={arrowNav(MODES, mode, setMode)}
      >
        {(
          [
            ["github", "URL do GitHub"],
            ["manual", "Local / Manual"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            data-value={value}
            aria-selected={mode === value}
            tabIndex={rovingTabIndex(mode === value)}
            onClick={() => setMode(value)}
            className={cn("rounded-md py-1.5 font-medium transition", mode === value ? "bg-surface text-fg shadow" : "text-muted hover:text-fg")}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "github" ? (
        <form onSubmit={submit} noValidate>
          <label htmlFor={urlId} className="sr-only">
            URL do repositório no GitHub
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                id={urlId}
                type="text"
                inputMode="url"
                autoComplete="off"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="github.com/owner/repo"
                aria-invalid={invalid || undefined}
                aria-describedby={invalid || error ? errorId : undefined}
                className={cn(
                  "h-10 w-full rounded-lg border bg-surface-2 pr-3 pl-9 font-mono text-sm text-fg placeholder:text-muted/60",
                  invalid ? "border-danger" : "border-line",
                )}
              />
            </div>
            <Button type="submit" variant="primary" loading={loading} disabled={!url.trim()}>
              Analisar
            </Button>
          </div>
          {(invalid || error) && (
            <p id={errorId} role="alert" className="mt-2 text-xs text-danger">
              {invalid ? "URL inválida. Use https://github.com/<owner>/<repo>." : error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>Exemplos:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setUrl(`https://github.com/${ex}`);
                  setTouched(false);
                  onAnalyze(`https://github.com/${ex}`);
                }}
                className="rounded-md border border-line px-1.5 py-0.5 font-mono hover:border-accent hover:text-fg"
              >
                {ex}
              </button>
            ))}
          </div>
        </form>
      ) : (
        <ManualForm onSubmit={onManual} />
      )}
    </Card>
  );
}

function ManualForm({ onSubmit }: { onSubmit: (m: RepoMetadata) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [treeText, setTreeText] = useState("");
  const [files, setFiles] = useState<ManualFile[]>([{ path: "package.json", content: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), desc: useId(), tree: useId() };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      onSubmit(buildManualMetadata({ name, description, treeText, files }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dados inválidos.");
    }
  };

  const onFolder = async (list: FileList | null) => {
    if (!list?.length) return;
    setReading(true);
    setError(null);
    try {
      onSubmit(await readLocalFolder(list));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler a pasta.");
    } finally {
      setReading(false);
      if (folderInput.current) folderInput.current.value = "";
    }
  };

  const input = "w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-fg placeholder:text-muted/60";

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <input
        ref={folderInput}
        type="file"
        className="hidden"
        // Atributos não padronizados para seleção de diretório.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        multiple
        onChange={(e) => void onFolder(e.target.files)}
        aria-label="Selecionar pasta do projeto"
      />
      <Button className="w-full" icon={reading ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />} onClick={() => folderInput.current?.click()} disabled={reading}>
        Abrir pasta local
      </Button>
      <p className="text-center text-xs text-muted">Lida no navegador — só manifestos e .env.example são lidos; nada é enviado além dos metadados.</p>

      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> ou preencha manualmente <span className="h-px flex-1 bg-line" />
      </div>

      <div className="space-y-1">
        <label htmlFor={ids.name} className="text-xs text-muted">
          Nome do projeto *
        </label>
        <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} className={cn(input, "h-9")} placeholder="meu-projeto" required />
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.desc} className="text-xs text-muted">
          Descrição
        </label>
        <input id={ids.desc} value={description} onChange={(e) => setDescription(e.target.value)} className={cn(input, "h-9")} placeholder="O que o projeto faz em uma frase" />
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.tree} className="text-xs text-muted">
          Árvore de arquivos (saída de <code className="font-mono">tree</code> ou lista de caminhos)
        </label>
        <textarea
          id={ids.tree}
          value={treeText}
          onChange={(e) => setTreeText(e.target.value)}
          rows={5}
          className={cn(input, "py-2 font-mono text-xs")}
          placeholder={"src/main.ts\nsrc/routes/users.ts\ntests/users.test.ts\nDockerfile"}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs text-muted">Arquivos de manifesto</legend>
        {files.map((file, i) => (
          <div key={i} className="rounded-lg border border-line bg-surface-2 p-2">
            <div className="mb-1 flex items-center gap-2">
              <select
                value={file.path}
                onChange={(e) => setFiles((fs) => fs.map((f, j) => (j === i ? { ...f, path: e.target.value } : f)))}
                className="h-7 flex-1 rounded-md border border-line bg-surface px-2 font-mono text-xs text-fg"
                aria-label={`Tipo do arquivo ${i + 1}`}
              >
                {MANIFEST_OPTIONS.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
              <button type="button" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:text-danger" aria-label={`Remover arquivo ${i + 1}`}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <textarea
              value={file.content}
              onChange={(e) => setFiles((fs) => fs.map((f, j) => (j === i ? { ...f, content: e.target.value } : f)))}
              rows={4}
              className="w-full rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-fg"
              placeholder={`Cole o conteúdo de ${file.path}`}
              aria-label={`Conteúdo de ${file.path}`}
            />
          </div>
        ))}
        {files.length < 6 && (
          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setFiles((fs) => [...fs, { path: "requirements.txt", content: "" }])}>
            Adicionar arquivo
          </Button>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="flex items-center gap-1 text-xs text-danger">
          <X className="size-3.5" /> {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full">
        Usar estes dados
      </Button>
    </form>
  );
}
