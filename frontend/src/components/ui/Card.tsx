import type { PropsWithChildren, ReactNode } from "react";

import { cn } from "../../lib/cn";

type CardProps = PropsWithChildren<{
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  bodyClassName?: string;
  padded?: boolean;
}>;

export function Card({
  children,
  className,
  title,
  subtitle,
  icon,
  actions,
  bodyClassName,
  padded = true,
}: CardProps) {
  const hasHeader = title || subtitle || icon || actions;

  return (
    <section className={cn("panel overflow-hidden", className)}>
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 border-b border-surface-100 bg-gradient-to-b from-white to-surface-50/40 px-6 py-4">
          <div className="flex items-start gap-3">
            {icon ? (
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                {icon}
              </div>
            ) : null}
            <div>
              {title ? (
                <h3 className="font-display text-base font-semibold text-surface-900">
                  {title}
                </h3>
              ) : null}
              {subtitle ? (
                <p className="mt-1 text-sm text-surface-600">{subtitle}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(padded && "p-6", bodyClassName)}>{children}</div>
    </section>
  );
}
