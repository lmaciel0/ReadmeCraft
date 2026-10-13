import { useState } from "react";
import { Download, RotateCcw, Save, Trash2 } from "lucide-react";
import { TEMPLATES } from "../../lib/catalog";
import { downloadMarkdown } from "../../lib/download";
import type { HistoryEntry } from "../../services/historyStore";
import { Button } from "../common/Button";

interface Props {
  entries: HistoryEntry[];
  canSaveCurrent: boolean;
  onSaveCurrent: () => void;
  onRestore: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

const ORIGIN_LABEL: Record<HistoryEntry["origin"], string> = { claude: "Claude", template: "Templates", manual: "Manual" };
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function HistoryPanel({ entries, canSaveCurrent, onSaveCurrent, onRestore, onRemove, onClear }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Versões salvas neste navegador (até 20). Cada geração concluída é salva automaticamente.
        </p>
        <Button size="sm" icon={<Save className="size-4" />} onClick={onSaveCurrent} disabled={!canSaveCurrent}>
          Salvar versão atual
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">Nenhuma versão salva ainda.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Versões salvas">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{e.repo ?? e.title}</p>
                <p className="text-xs text-muted">
                  <time dateTime={new Date(e.createdAt).toISOString()}>{dateFmt.format(e.createdAt)}</time> · {TEMPLATES[e.template]?.name ?? e.template} ·{" "}
                  {ORIGIN_LABEL[e.origin]} · {e.markdown.split("\n").length} linhas
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => onRestore(e)} aria-label={`Restaurar versão de ${dateFmt.format(e.createdAt)}`}>
                  Restaurar
                </Button>
                <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => downloadMarkdown(e.markdown)} aria-label={`Baixar versão de ${dateFmt.format(e.createdAt)}`} />
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => onRemove(e.id)} aria-label={`Excluir versão de ${dateFmt.format(e.createdAt)}`} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 className="size-3.5" />}
            onClick={() => {
              if (confirmClear) {
                onClear();
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
              }
            }}
            onBlur={() => setConfirmClear(false)}
          >
            {confirmClear ? "Confirmar: apagar tudo" : "Limpar histórico"}
          </Button>
        </div>
      )}
    </div>
  );
}
