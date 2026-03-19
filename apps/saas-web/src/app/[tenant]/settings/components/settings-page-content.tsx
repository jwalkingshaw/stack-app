import type { ReactNode } from "react";
import {
  PageContentContainer,
  type PageContentMode,
  type PageContentPadding,
} from "@/components/ui/page-content-container";
import { cn } from "@/lib/utils";
import { getSettingsWidthConfig, type SettingsPageKey } from "./settings-width-map";

interface SettingsPageContentProps {
  page: SettingsPageKey;
  children: ReactNode;
  className?: string;
  padding?: PageContentPadding;
  modeOverride?: PageContentMode;
}

export function SettingsPageContent({
  page,
  children,
  className,
  padding = "page",
  modeOverride,
}: SettingsPageContentProps) {
  const config = getSettingsWidthConfig(page);
  return (
    <PageContentContainer
      mode={modeOverride ?? config.mode}
      padding={padding}
      className={cn(config.defaultClassName, className)}
    >
      {children}
    </PageContentContainer>
  );
}

interface SettingsContentBoundaryProps {
  children: ReactNode;
  className?: string;
  size?: "md" | "lg" | "xl";
}

const BOUNDARY_CLASS_BY_SIZE: Record<NonNullable<SettingsContentBoundaryProps["size"]>, string> = {
  md: "max-w-4xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
};

export function SettingsContentBoundary({
  children,
  className,
  size = "lg",
}: SettingsContentBoundaryProps) {
  return (
    <div className={cn("mx-auto w-full", BOUNDARY_CLASS_BY_SIZE[size], className)}>
      {children}
    </div>
  );
}

interface SettingsSecondLevelPageProps {
  page: SettingsPageKey;
  backLink: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsSecondLevelPage({
  page,
  backLink,
  children,
  className,
}: SettingsSecondLevelPageProps) {
  const config = getSettingsWidthConfig(page);
  const contentWidthClass =
    config.mode === "form"
      ? "mx-auto w-full max-w-4xl"
      : config.mode === "content"
      ? "mx-auto w-full max-w-5xl"
      : config.mode === "narrow"
      ? "mx-auto w-full max-w-3xl"
      : "w-full";

  return (
    <PageContentContainer mode="fluid" padding="page" className="space-y-5">
      {backLink ? <div>{backLink}</div> : null}
      <div className={cn(contentWidthClass, config.defaultClassName, className)}>
        {children}
      </div>
    </PageContentContainer>
  );
}
