import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type PageContentMode = "fluid" | "content" | "form" | "narrow";
export type PageContentPadding = "none" | "compact" | "page";

const MODE_CLASSES: Record<PageContentMode, string> = {
  fluid: "w-full",
  content: "mx-auto w-full max-w-5xl",
  form: "mx-auto w-full max-w-4xl",
  narrow: "mx-auto w-full max-w-3xl",
};

const PADDING_CLASSES: Record<PageContentPadding, string> = {
  none: "",
  compact: "px-4 pt-4 pb-4 sm:px-6",
  page: "px-4 pt-6 pb-8 sm:px-6 sm:pt-7 sm:pb-10",
};

interface PageContentContainerProps {
  children: ReactNode;
  className?: string;
  mode?: PageContentMode;
  padding?: PageContentPadding;
}

export function PageContentContainer({
  children,
  className,
  mode = "fluid",
  padding = "none",
}: PageContentContainerProps) {
  return (
    <div className={cn(MODE_CLASSES[mode], PADDING_CLASSES[padding], className)}>
      {children}
    </div>
  );
}
