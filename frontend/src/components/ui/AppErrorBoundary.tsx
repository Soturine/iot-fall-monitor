import { Component, type ErrorInfo, type ReactNode } from "react";

import {
  clearStoredOrganizationId,
  clearStoredToken,
  clearStoredUser,
} from "../../lib/storage";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string | null;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "Erro inesperado ao renderizar a aplicacao.",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AppErrorBoundary", error, errorInfo);
  }

  handleReset = () => {
    clearStoredUser();
    clearStoredToken();
    clearStoredOrganizationId();
    window.location.assign("/login");
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="panel w-full max-w-2xl space-y-5 px-8 py-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
              Erro de interface
            </p>
            <h1 className="mt-3 font-display text-4xl text-surface-900">
              A aplicacao encontrou um erro inesperado.
            </h1>
            <p className="mt-3 text-sm leading-6 text-surface-600">
              Isso costuma acontecer quando existe uma sessao antiga salva no navegador
              e a estrutura de autenticacao mudou entre versoes.
            </p>
          </div>

          <div className="rounded-[24px] border border-surface-100 bg-surface-50 px-5 py-4">
            <p className="text-sm font-semibold text-surface-900">Mensagem tecnica</p>
            <p className="mt-2 text-sm text-surface-600">
              {this.state.errorMessage || "Erro inesperado ao renderizar a interface."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full bg-surface-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-surface-800"
              onClick={this.handleReset}
              type="button"
            >
              Limpar sessao local e abrir login
            </button>
            <button
              className="rounded-full border border-surface-200 px-5 py-3 text-sm font-semibold text-surface-700 transition hover:bg-surface-50"
              onClick={() => window.location.reload()}
              type="button"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }
}
