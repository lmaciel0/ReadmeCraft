import type { KeyboardEvent } from "react";

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

/**
 * Navegação por setas para grupos `role="tablist"` / `role="radiogroup"` (padrão WAI-ARIA):
 * setas movem e selecionam, Home/End vão para as pontas. Cada item precisa de `data-value`.
 */
export function arrowNav<T extends string>(values: readonly T[], current: T, onSelect: (value: T) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const idx = values.indexOf(current);
    let next: number;
    if (NEXT_KEYS.has(e.key)) next = (idx + 1) % values.length;
    else if (PREV_KEYS.has(e.key)) next = (idx - 1 + values.length) % values.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = values.length - 1;
    else return;
    e.preventDefault();
    const value = values[next]!;
    onSelect(value);
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${value}"]`)?.focus();
  };
}

/** Foco itinerante: só o item selecionado entra na ordem de Tab. */
export const rovingTabIndex = (selected: boolean) => (selected ? 0 : -1);
