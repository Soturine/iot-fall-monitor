import type { PropsWithChildren, ReactNode } from "react";

import { cn } from "../../lib/cn";

const tones = {
  neutral:
    "bg-surface-100 text-surface-700 ring-1 ring-inset ring-surface-200/60",
  success:
    "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200/60",
  warning:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100",
  danger:
    "bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-100",
  critical:
    "bg-danger-600 text-white shadow-soft animate-pulse",
  info:
    "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100",
  muted:
    "bg-white text-surface-600 ring-1 ring-inset ring-surface-200",
  dark:
    "bg-surface-900 text-white",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  icon,
  dot,
}: PropsWithChildren<{
  tone?: keyof typeof tones;
  className?: string;
  icon?: ReactNode;
  dot?: boolean;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
        tones[tone],
        className,
      )}
    >
      {dot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "success" && "bg-teal-500",
            tone === "warning" && "bg-amber-500",
            tone === "danger" && "bg-danger-500",
            tone === "critical" && "bg-white",
            tone === "info" && "bg-sky-500",
            (tone === "neutral" || tone === "muted") && "bg-surface-400",
            tone === "dark" && "bg-teal-300",
          )}
        />
      ) : null}
      {icon}
      {children}
    </span>
  );
}
