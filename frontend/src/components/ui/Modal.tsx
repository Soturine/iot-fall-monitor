import type { PropsWithChildren, ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "./Button";

type ModalProps = PropsWithChildren<{
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
}>;

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  footer,
  children,
}: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/45 px-4 py-6 backdrop-blur-sm">
      <div className="panel max-h-[90vh] w-full max-w-3xl overflow-hidden p-0">
        <div className="flex items-start justify-between border-b border-surface-100 px-6 py-5">
          <div>
            <h3 className="font-display text-2xl text-surface-900">{title}</h3>
            {subtitle ? (
              <p className="mt-2 text-sm text-surface-600">{subtitle}</p>
            ) : null}
          </div>
          <Button onClick={onClose} variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="border-t border-surface-100 px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
