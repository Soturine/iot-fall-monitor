export function LoadingState({ label = "Carregando dados..." }: { label?: string }) {
  return (
    <div className="panel-soft flex min-h-48 flex-col items-center justify-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-surface-200 border-t-surface-600" />
      <p className="text-sm font-medium text-surface-600">{label}</p>
    </div>
  );
}
