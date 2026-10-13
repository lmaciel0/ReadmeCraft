import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Estado persistido no localStorage (conveniência por usuário: rascunho, tema, opções).
 * Toda leitura/escrita é protegida: em modo privado ou com storage bloqueado, funciona em memória.
 */
export function useLocalStorage<T>(key: string, initial: T, { debounceMs = 0 }: { debounceMs?: number } = {}) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const write = () => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // storage indisponível ou cheio: ignora
      }
    };
    if (!debounceMs) return write();
    clearTimeout(timer.current);
    timer.current = setTimeout(write, debounceMs);
    return () => clearTimeout(timer.current);
  }, [key, value, debounceMs]);

  const reset = useCallback(() => setValue(initial), [initial]);
  return [value, setValue, reset] as const;
}
