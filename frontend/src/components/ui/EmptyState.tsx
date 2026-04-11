import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-soft flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="rounded-full bg-surface-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-surface-600">
        Sem dados
      </div>
      <div>
        <h3 className="font-display text-2xl text-surface-900">{title}</h3>
        <p className="mt-2 max-w-xl text-sm text-surface-600">{description}</p>
      </div>
      {action}
    </div>
  );
}
