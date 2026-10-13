import { LogOut } from "lucide-react";
import { GithubMark } from "../common/GithubMark";
import type { AuthState } from "../../hooks/useAuth";

interface Props {
  state: AuthState;
  onLogin: () => void;
  onLogout: () => void;
}

export function AccountMenu({ state, onLogin, onLogout }: Props) {
  if (state.status === "loading") return <span className="size-8 animate-pulse rounded-full bg-surface-3" aria-label="Carregando conta" />;

  if (state.status === "anonymous") {
    return (
      <button
        type="button"
        onClick={onLogin}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg transition hover:border-accent"
      >
        <GithubMark className="size-4" />
        <span className="hidden sm:inline">Entrar com GitHub</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <img src={state.user.avatar} alt="" className="size-8 rounded-full border border-line" referrerPolicy="no-referrer" />
      <span className="hidden text-sm text-fg lg:inline">{state.user.login}</span>
      <button type="button" onClick={onLogout} className="rounded-lg border border-line p-2 text-muted transition hover:text-fg" aria-label={`Sair da conta ${state.user.login}`}>
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
