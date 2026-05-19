import { cn } from "../../lib/cn";

export function LoadingState({
  label = "Carregando dados...",
  className,
  inline = false,
}: {
  label?: string;
  className?: string;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className={cn("flex items-center gap-3 text-sm text-surface-600", className)}>
        <Spinner />
        <span>{label}</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex min-h-56 flex-col items-center justify-center gap-4 rounded-3xl border border-surface-100 bg-white/60 px-6 py-10 shadow-soft backdrop-blur",
        className,
      )}
    >
      <Spinner large />
      <p className="text-sm font-medium text-surface-600">{label}</p>
    </div>
  );
}

function Spinner({ large = false }: { large?: boolean }) {
  return (
    <div
      className={cn(
        "relative",
        large ? "h-12 w-12" : "h-5 w-5",
      )}
      aria-hidden="true"
    >
      <div
        className={cn(
          "absolute inset-0 animate-spin rounded-full border-surface-200",
          large ? "border-4 border-t-teal-500" : "border-2 border-t-teal-500",
        )}
      />
      <div
        className={cn(
          "absolute inset-1 rounded-full bg-gradient-to-br from-teal-400/15 to-transparent",
          large ? "" : "hidden",
        )}
      />
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-4 w-full animate-pulse rounded-md bg-gradient-to-r from-surface-100 via-surface-200/60 to-surface-100",
        className,
      )}
    />
  );
}
