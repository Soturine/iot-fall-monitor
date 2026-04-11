import type { PropsWithChildren } from "react";

import { cn } from "../../lib/cn";

const tones = {
  neutral: "bg-surface-100 text-surface-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-danger-100 text-danger-700",
  info: "bg-sky-100 text-sky-700",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: PropsWithChildren<{
  tone?: keyof typeof tones;
  className?: string;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
