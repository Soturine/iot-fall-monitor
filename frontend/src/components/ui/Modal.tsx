import { useEffect, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "../../lib/cn";

type ModalProps = PropsWithChildren<{
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}>;

const sizes = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({
  open,
  title,
  subtitle,
  icon,
  onClose,
  footer,
  size = "lg",
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-900/55 px-4 py-6 backdrop-blur-md animate-[fade_120ms_ease-out]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "relative max-h-[92vh] w-full overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_40px_120px_-20px_rgba(15,36,49,0.55)]",
          "animate-[modalIn_180ms_cubic-bezier(0.16,1,0.3,1)]",
          sizes[size],
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-teal-50/60 to-transparent" />
        <div className="relative flex items-start justify-between gap-4 border-b border-surface-100 px-6 py-5">
          <div className="flex items-start gap-3">
            {icon ? (
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 ring-1 ring-inset ring-teal-200">
                {icon}
              </div>
            ) : null}
            <div>
              <h3 className="font-display text-xl font-semibold text-surface-900">
                {title}
              </h3>
              {subtitle ? (
                <p className="mt-1 text-sm text-surface-600">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <button
            aria-label="Fechar"
            className="grid h-9 w-9 place-items-center rounded-xl text-surface-500 transition hover:bg-surface-100 hover:text-surface-900"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative max-h-[64vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="relative flex items-center justify-end gap-2 border-t border-surface-100 bg-surface-50/60 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
