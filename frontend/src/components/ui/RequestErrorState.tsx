import { RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

export function RequestErrorState({
  message = "Erro ao carregar dados. Tente novamente.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      action={
        <Button onClick={onRetry} type="button" variant="secondary">
          <RotateCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      }
      description={message}
      icon={<TriangleAlert className="h-6 w-6" />}
      title="Não foi possível carregar"
      tone="danger"
    />
  );
}
