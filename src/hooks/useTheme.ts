import { useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

export type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>("rc:theme", "dark");
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
