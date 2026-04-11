import type { PropsWithChildren } from "react";

import { cn } from "../../lib/cn";

export function Card({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return <section className={cn("panel p-6", className)}>{children}</section>;
}
