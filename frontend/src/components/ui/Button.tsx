import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import { cn } from "../../lib/cn";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
  }
>;

const variants = {
  primary:
    "bg-gradient-to-b from-surface-800 to-surface-900 text-white shadow-soft hover:from-surface-700 hover:to-surface-800 focus:ring-surface-200",
  secondary:
    "bg-white text-surface-800 border border-surface-200 hover:border-teal-400 hover:text-teal-700 focus:ring-teal-100",
  ghost:
    "bg-transparent text-surface-700 hover:bg-surface-100 focus:ring-surface-100",
  danger:
    "bg-danger-600 text-white shadow-soft hover:bg-danger-700 focus:ring-danger-100",
};

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
