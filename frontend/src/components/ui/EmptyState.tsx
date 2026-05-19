import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { cn } from "../../lib/cn";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  tone = "neutral",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneRing = {
    neutral: "from-surface-50 to-white ring-surface-100",
    success: "from-teal-50/60 to-white ring-teal-100",
    warning: "from-amber-50/60 to-white ring-amber-100",
    danger: "from-danger-50/60 to-white ring-danger-100",
  }[tone];

  const iconBg = {
    neutral: "bg-surface-100 text-surface-600",
    success: "bg-teal-100 text-teal-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-danger-100 text-danger-700",
  }[tone];

  return (
    <div
      className={cn(
        "flex min-h-56 flex-col items-center justify-center gap-4 rounded-3xl bg-gradient-to-b px-6 py-12 text-center ring-1 ring-inset",
        toneRing,
        className,
      )}
    >
      <div
        className={cn(
          "grid h-14 w-14 place-items-center rounded-2xl shadow-soft",
          iconBg,
        )}
      >
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <div>
        <h3 className="font-display text-xl font-semibold text-surface-900">
          {title}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-surface-600">
          {description}
        </p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
