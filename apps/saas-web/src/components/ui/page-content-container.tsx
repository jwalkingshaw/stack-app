import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type PageContentMode = "fluid" | "content" | "form" | "narrow";

const MODE_CLASSES: Record<PageContentMode, string> = {
  fluid: "w-full",
  content: "mx-auto w-full max-w-5xl",
  form: "mx-auto w-full max-w-4xl",
  narrow: "mx-auto w-full max-w-3xl",
};

interface PageContentContainerProps {
  children: ReactNode;
  className?: string;
  mode?: PageContentMode;
}

export function PageContentContainer({
  children,
  className,
  mode = "fluid",
}: PageContentContainerProps) {
  return <div className={cn(MODE_CLASSES[mode], className)}>{children}</div>;
}
