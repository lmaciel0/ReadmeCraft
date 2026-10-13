import { Check, Copy, Download, History, ImagePlus, RefreshCw, Shield, Square } from "lucide-react";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { downloadMarkdown } from "../../lib/download";
import { Button } from "../common/Button";

interface Props {
  markdown: string;
  streaming: boolean;
  canGenerate: boolean;
  onRegenerate: () => void;
  onCancel: () => void;
  onOpenBadges: () => void;
  onOpenBanner: () => void;
  onOpenHistory: () => void;
  onNotify: (message: string) => void;
}

export function ExportToolbar({ markdown, streaming, canGenerate, onRegenerate, onCancel, onOpenBadges, onOpenBanner, onOpenHistory, onNotify }: Props) {
  const { copied, copy } = useCopyToClipboard();
  const empty = !markdown.trim();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" icon={<Shield className="size-4" />} onClick={onOpenBadges} disabled={streaming} aria-label="Badges">
        <span className="hidden sm:inline">Badges</span>
      </Button>
      <Button size="sm" variant="ghost" icon={<ImagePlus className="size-4" />} onClick={onOpenBanner} disabled={streaming} aria-label="Banner">
        <span className="hidden sm:inline">Banner</span>
      </Button>
      <Button size="sm" variant="ghost" icon={<History className="size-4" />} onClick={onOpenHistory} disabled={streaming} aria-label="Histórico">
        <span className="hidden sm:inline">Histórico</span>
      </Button>
      {streaming ? (
        <Button size="sm" variant="danger" icon={<Square className="size-3.5" />} onClick={onCancel}>
          Parar
        </Button>
      ) : (
        <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={onRegenerate} disabled={!canGenerate}>
          Regenerar
        </Button>
      )}
      <Button
        size="sm"
        icon={copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        disabled={empty}
        onClick={async () => onNotify((await copy(markdown)) ? "Markdown copiado para a área de transferência." : "Não foi possível copiar.")}
      >
        {copied ? "Copiado" : "Copiar"}
      </Button>
      <Button size="sm" variant="primary" icon={<Download className="size-4" />} disabled={empty} onClick={() => downloadMarkdown(markdown)}>
        README.md
      </Button>
    </div>
  );
}
