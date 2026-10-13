import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Columns2, Eye, FileCode2, X } from "lucide-react";
import { Modal } from "./components/common/Modal";
import { ExportToolbar } from "./components/editor/ExportToolbar";
import { MarkdownEditor, type MarkdownEditorHandle } from "./components/editor/MarkdownEditor";
import { SectionManager, type EditableOptions } from "./components/editor/SectionManager";
import { Toolbar } from "./components/editor/Toolbar";
import { Header } from "./components/layout/Header";
import { HistoryPanel } from "./components/editor/HistoryPanel";
import { BadgeGallery } from "./components/preview/BadgeGallery";
import { BannerStudio } from "./components/preview/BannerStudio";
import { MarkdownPreview } from "./components/preview/MarkdownPreview";
import { RepoInput } from "./components/repository/RepoInput";
import { TechStackDetector } from "./components/repository/TechStackDetector";
import { useGithubRepo } from "./hooks/useGithubRepo";
import { useHealth } from "./hooks/useHealth";
import { useHistory } from "./hooks/useHistory";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useReadmeGenerator } from "./hooks/useReadmeGenerator";
import { useTheme } from "./hooks/useTheme";
import { TEMPLATES } from "./lib/catalog";
import { arrowNav, rovingTabIndex } from "./lib/a11y";
import { cn } from "./lib/cn";
import { listSectionIds } from "./lib/sections";
import { BANNER_PATH, bannerMarkdown, svgDataUrl } from "./services/bannerGenerator";
import type { HistoryEntry } from "./services/historyStore";
import type { GeneratorEngine } from "./types/readme";
import type { SectionId, TemplateId } from "./types/template";

const VIEWS = ["editor", "split", "preview"] as const;
type View = (typeof VIEWS)[number];

const DEFAULT_OPTIONS: EditableOptions = {
  template: "showcase",
  sections: TEMPLATES.showcase.defaultSections,
  tone: "professional",
  language: "pt-BR",
  includeEmoji: TEMPLATES.showcase.useEmoji,
  extraInstructions: "",
};

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const health = useHealth();
  const repo = useGithubRepo();
  const [options, setOptions] = useLocalStorage<EditableOptions>("rc:options", DEFAULT_OPTIONS);
  const [markdown, setMarkdown] = useLocalStorage("rc:draft", "", { debounceMs: 500 });
  const [view, setView] = useState<View>("split");
  const [modal, setModal] = useState<"badges" | "banner" | "history" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bannerSvg, setBannerSvg] = useLocalStorage<string | null>("rc:banner", null);
  const history = useHistory();
  const repoState = repo.state;
  const onComplete = useCallback(
    (text: string, engine: GeneratorEngine) => {
      const meta = repoState.status === "success" ? repoState.metadata : null;
      history.save({ title: meta?.name ?? "README", repo: meta?.fullName, template: options.template, origin: engine, markdown: text });
    },
    [history, repoState, options.template],
  );
  const generator = useReadmeGenerator({ markdown, setMarkdown, onError: setToast, onComplete });
  const editorRef = useRef<MarkdownEditorHandle>(null);

  // Preview com prioridade menor que a digitação: o editor nunca trava nem perde o cursor.
  const deferredMarkdown = useDeferredValue(markdown);
  const presentSections = useMemo(() => listSectionIds(deferredMarkdown), [deferredMarkdown]);

  const metadata = repo.state.status === "success" ? repo.state.metadata : null;
  const aiEnabled = health.status === "online" && health.health.ai;
  const canGenerate = Boolean(metadata) && health.status !== "offline";
  const streaming = generator.isStreaming;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const changeTemplate = (id: TemplateId) =>
    setOptions((o) => ({ ...o, template: id, sections: TEMPLATES[id].defaultSections, includeEmoji: TEMPLATES[id].useEmoji }));

  const generate = useCallback(() => {
    if (metadata) void generator.generate(metadata, options);
  }, [generator, metadata, options]);

  const regenerateSection = useCallback(
    (id: SectionId) => {
      if (metadata) void generator.regenerateSection(metadata, options, id);
    },
    [generator, metadata, options],
  );

  const insertBadge = (md: string) => {
    editorRef.current?.insert(`${md} `);
    setToast("Badge inserido no cursor do editor.");
  };

  // O preview resolve ./assets/banner.svg para o SVG gerado, antes mesmo do commit.
  const previewAssets = useMemo(() => (bannerSvg ? { [BANNER_PATH.slice(2)]: svgDataUrl(bannerSvg) } : undefined), [bannerSvg]);

  const insertBanner = (svg: string, alt: string) => {
    setBannerSvg(svg);
    // Banner abre o README: entra no topo, não na posição do cursor.
    if (!markdown.includes(BANNER_PATH)) setMarkdown(`${bannerMarkdown(alt)}\n${markdown}`);
    setModal(null);
    if (view === "preview") setView("editor");
    setToast(`Banner inserido. Salve o arquivo baixado em ${BANNER_PATH.slice(2)}.`);
  };

  const saveCurrent = () =>
    setToast(
      history.save({ title: metadata?.name ?? "README", repo: metadata?.fullName, template: options.template, origin: "manual", markdown })
        ? "Versão salva no histórico."
        : "Esta versão já está salva.",
    );

  const restore = (entry: HistoryEntry) => {
    // Guarda o estado atual antes de sobrescrever, para a restauração ser reversível.
    history.save({ title: metadata?.name ?? "README", repo: metadata?.fullName, template: options.template, origin: "manual", markdown });
    setMarkdown(entry.markdown);
    setModal(null);
    setToast("Versão restaurada. A versão anterior foi salva no histórico.");
  };

  const stats = useMemo(() => {
    const words = deferredMarkdown.trim() ? deferredMarkdown.trim().split(/\s+/).length : 0;
    return { words, lines: deferredMarkdown.split("\n").length };
  }, [deferredMarkdown]);

  return (
    <div className="flex h-full flex-col">
      <Header template={options.template} onTemplateChange={changeTemplate} health={health} theme={theme} onToggleTheme={toggleTheme} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 space-y-4 overflow-y-auto border-line p-4 lg:w-[360px] lg:border-r" aria-label="Configuração">
          <RepoInput
            loading={repo.state.status === "loading"}
            error={repo.state.status === "error" ? repo.state.error : null}
            onAnalyze={(url) => void repo.analyze(url)}
            onManual={repo.setManual}
          />
          {metadata && <TechStackDetector metadata={metadata} />}
          <SectionManager
            options={options}
            onChange={setOptions}
            onGenerate={generate}
            onRegenerateSection={regenerateSection}
            canGenerate={canGenerate}
            streaming={streaming}
            streamingSection={generator.state.status === "streaming" ? generator.state.section : null}
            presentSections={presentSections}
            aiEnabled={aiEnabled}
          />
        </aside>

        <main className="flex min-h-[70vh] min-w-0 flex-1 flex-col lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
            <div
              role="tablist"
              aria-label="Visualização"
              className="inline-flex rounded-lg bg-surface-2 p-0.5"
              onKeyDown={arrowNav(VIEWS, view, setView)}
            >
              {(
                [
                  ["editor", "Editor", FileCode2],
                  ["split", "Lado a lado", Columns2],
                  ["preview", "Preview", Eye],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  data-value={value}
                  aria-selected={view === value}
                  tabIndex={rovingTabIndex(view === value)}
                  onClick={() => setView(value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                    value === "split" && "hidden xl:flex",
                    view === value ? "bg-surface text-fg shadow" : "text-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden /> {label}
                </button>
              ))}
            </div>
            <ExportToolbar
              markdown={markdown}
              streaming={streaming}
              canGenerate={canGenerate}
              onRegenerate={generate}
              onCancel={generator.cancel}
              onOpenBadges={() => setModal("badges")}
              onOpenBanner={() => setModal("banner")}
              onOpenHistory={() => setModal("history")}
              onNotify={setToast}
            />
          </div>

          <div className={cn("grid min-h-0 flex-1", view === "split" ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1")}>
            <section
              aria-label="Editor"
              className={cn(
                "flex min-h-0 flex-col border-line bg-surface",
                view === "split" ? "hidden border-r xl:flex" : view === "editor" ? "flex" : "hidden",
              )}
            >
              <div className="flex items-center border-b border-line px-2 py-1">
                <Toolbar editor={editorRef} disabled={streaming} />
              </div>
              <div className="min-h-0 flex-1">
                <MarkdownEditor ref={editorRef} value={markdown} onChange={setMarkdown} readOnly={streaming} />
              </div>
            </section>

            <section
              aria-label="Preview"
              aria-busy={streaming}
              className={cn("min-h-0 overflow-y-auto", view === "editor" ? "hidden" : view === "split" ? "block" : "block")}
            >
              <div className={cn("mx-auto max-w-[920px] px-6 py-8 lg:px-10", streaming && "rc-caret")}>
                {deferredMarkdown.trim() ? (
                  <MarkdownPreview markdown={deferredMarkdown} theme={theme} streaming={streaming} assets={previewAssets} />
                ) : (
                  <EmptyState hasRepo={Boolean(metadata)} />
                )}
              </div>
            </section>
          </div>

          <footer className="flex items-center justify-between gap-4 border-t border-line px-4 py-1.5 text-[11px] text-muted">
            <span>
              {stats.lines} linhas · {stats.words} palavras
            </span>
            <span aria-live="polite">
              {generator.state.status === "streaming"
                ? generator.state.section
                  ? `Regenerando seção ${generator.state.section}…`
                  : "Gerando…"
                : generator.state.status === "done"
                  ? generator.state.engine === "claude"
                    ? "Gerado com Claude"
                    : "Gerado por templates"
                  : "Rascunho salvo localmente"}
            </span>
          </footer>
        </main>
      </div>

      <Modal open={modal === "badges"} onClose={() => setModal(null)} title="Galeria de badges">
        <BadgeGallery
          metadata={metadata}
          onInsert={(md) => {
            insertBadge(md);
            setModal(null);
            if (view === "preview") setView("editor");
          }}
        />
      </Modal>
      <Modal open={modal === "banner"} onClose={() => setModal(null)} title="Gerador de banner">
        <BannerStudio key={metadata?.fullName ?? metadata?.name ?? "none"} metadata={metadata} defaultVariant={options.template} onInsert={insertBanner} />
      </Modal>
      <Modal open={modal === "history"} onClose={() => setModal(null)} title="Histórico de versões">
        <HistoryPanel
          entries={history.entries}
          canSaveCurrent={Boolean(markdown.trim())}
          onSaveCurrent={saveCurrent}
          onRestore={restore}
          onRemove={history.remove}
          onClear={history.clear}
        />
      </Modal>

      {/* Região viva sempre montada: leitores de tela anunciam a troca de texto. */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
        {toast && (
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-surface-3 px-4 py-2.5 text-sm text-fg shadow-2xl">
            <AlertCircle className="size-4 text-accent" aria-hidden />
            {toast}
            <button type="button" onClick={() => setToast(null)} aria-label="Fechar aviso" className="text-muted hover:text-fg">
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ hasRepo }: { hasRepo: boolean }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-4 rounded-2xl bg-accent-soft p-4">
        <FileCode2 className="size-8 text-accent" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">{hasRepo ? "Pronto para gerar" : "Comece por um repositório"}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {hasRepo
          ? "Ajuste template, seções e tom de voz, depois clique em Gerar README. O preview aparece aqui em tempo real."
          : "Cole a URL de um repositório público do GitHub ou abra uma pasta local. O README renderizado aparece aqui, idêntico ao GitHub."}
      </p>
    </div>
  );
}
