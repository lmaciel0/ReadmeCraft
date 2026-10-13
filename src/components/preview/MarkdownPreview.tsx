import { createContext, memo, useContext, useMemo, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { Element, ElementContent } from "hast";
import githubDark from "github-markdown-css/github-markdown-dark.css?inline";
import githubLight from "github-markdown-css/github-markdown-light.css?inline";
import hljsDark from "highlight.js/styles/github-dark.css?inline";
import hljsLight from "highlight.js/styles/github.css?inline";
import type { Theme } from "../../hooks/useTheme";
import { remarkGithubAlerts, resolveAnchor, sanitizeSchema } from "../../services/markdownSanitizer";
import { MermaidDiagram } from "./MermaidDiagram";

const remarkPlugins = [remarkGfm, remarkGithubAlerts];
// Ordem importa: HTML bruto → ids → SANITIZAÇÃO → realce (classes hljs geradas após sanitizar).
const rehypePlugins: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] = [
  rehypeRaw,
  rehypeSlug,
  [rehypeSanitize, sanitizeSchema],
  [rehypeHighlight, { detect: false, plainText: ["mermaid", "text", "txt", "env", "dotenv"] }],
];

function textContent(nodes: ElementContent[]): string {
  return nodes.map((n) => (n.type === "text" ? n.value : n.type === "element" ? textContent(n.children) : "")).join("");
}

function mermaidSource(pre: Element | undefined): string | null {
  const code = pre?.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
  const classes = code?.properties?.className;
  if (!code || !Array.isArray(classes) || !classes.includes("language-mermaid")) return null;
  return textContent(code.children);
}

interface PreviewSettings {
  theme: Theme;
  streaming: boolean;
  /** Arquivos locais ainda não commitados (ex.: banner gerado), por caminho relativo. */
  assets: Record<string, string>;
}

// Tema e estado de streaming chegam por contexto: o objeto `components` fica estável e
// o react-markdown não remonta os diagramas quando o stream termina ou o tema muda.
const NO_ASSETS: Record<string, string> = {};
const PreviewContext = createContext<PreviewSettings>({ theme: "dark", streaming: false, assets: NO_ASSETS });

const normalizeAssetPath = (src: string) => src.replace(/^\.\//, "");

function Img({ node: _node, alt = "", src, ...rest }: ComponentProps<"img"> & { node?: Element }) {
  const { assets } = useContext(PreviewContext);
  const local = typeof src === "string" ? assets[normalizeAssetPath(src)] : undefined;
  return <img {...rest} src={local ?? src} alt={alt} loading="lazy" referrerPolicy="no-referrer" />;
}

function Pre({ node, children, ...rest }: ComponentProps<"pre"> & { node?: Element }) {
  const { theme, streaming } = useContext(PreviewContext);
  const source = mermaidSource(node);
  if (source !== null) return <MermaidDiagram code={source.trim()} theme={theme} debounceMs={streaming ? 900 : 250} />;
  return <pre {...rest}>{children}</pre>;
}

const components: Components = {
  pre: Pre,
  a({ node: _node, href = "", children, ...rest }) {
    const isAnchor = href.startsWith("#");
    return (
      <a {...rest} href={resolveAnchor(href)} {...(isAnchor ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}>
        {children}
      </a>
    );
  },
  img: Img,
};

interface Props {
  markdown: string;
  theme: Theme;
  streaming?: boolean;
  assets?: Record<string, string>;
}

function MarkdownPreviewImpl({ markdown, theme, streaming = false, assets = NO_ASSETS }: Props) {
  const settings = useMemo(() => ({ theme, streaming, assets }), [theme, streaming, assets]);
  return (
    <>
      <style>{theme === "dark" ? githubDark + hljsDark : githubLight + hljsLight}</style>
      <PreviewContext.Provider value={settings}>
        <article className="markdown-body" data-testid="markdown-preview">
          <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
            {markdown}
          </ReactMarkdown>
        </article>
      </PreviewContext.Provider>
    </>
  );
}

/** Memoizado: só re-renderiza quando o texto (já adiado com useDeferredValue) ou o tema mudam. */
export const MarkdownPreview = memo(MarkdownPreviewImpl);
