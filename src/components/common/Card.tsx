import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function Card({ title, icon, actions, className, children, ...rest }: CardProps) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface", className)} {...rest}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            {icon && <span className="text-accent" aria-hidden>{icon}</span>}
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
