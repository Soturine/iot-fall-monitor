import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-2xl px-8 py-10 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.32em] text-surface-500">
          404
        </p>
        <h1 className="mt-4 font-display text-5xl text-surface-900">
          Página não encontrada
        </h1>
        <p className="mt-4 text-sm leading-6 text-surface-600">
          O endereço informado não existe neste dashboard. Volte para o painel principal
          para continuar o monitoramento.
        </p>
        <Link
          className="mt-8 inline-flex rounded-full bg-surface-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-surface-700"
          to="/dashboard"
        >
          Ir para o dashboard
        </Link>
      </div>
    </div>
  );
}
