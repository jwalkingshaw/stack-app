import { Children, isValidElement, type ReactNode } from "react";
import {
  PageContentContainer,
  type PageContentMode,
  type PageContentPadding,
} from "@/components/ui/page-content-container";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { getSettingsWidthConfig, type SettingsPageKey } from "./settings-width-map";

interface SettingsPageContentProps {
  page: SettingsPageKey;
  children: ReactNode;
  className?: string;
  padding?: PageContentPadding;
  modeOverride?: PageContentMode;
}

function hasHeadingLikeContent(node: ReactNode, depth = 0): boolean {
  if (!isValidElement(node) || depth > 3) return false;

  if (node.type === PageHeader) return true;
  if (typeof node.type === "string" && ["h1", "h2", "h3", "header"].includes(node.type)) {
    return true;
  }

  const nestedChildren = Children.toArray(
    (node.props as { children?: ReactNode } | undefined)?.children
  );
  return nestedChildren.some((child) => hasHeadingLikeContent(child, depth + 1));
}

export function SettingsPageContent({
  page,
  children,
  className,
  padding = "page",
  modeOverride,
}: SettingsPageContentProps) {
  const config = getSettingsWidthConfig(page);
  const childrenArray = Children.toArray(children);
  const firstChild = childrenArray[0];
  const remainingChildren = childrenArray.slice(1);
  const introAfterFirstChild = hasHeadingLikeContent(firstChild);

  return (
    <PageContentContainer
      mode={modeOverride ?? config.mode}
      padding={padding}
      className={cn(config.defaultClassName, className)}
    >
      {introAfterFirstChild ? (
        <div className="space-y-2">
          {firstChild}
          <p className="text-sm leading-relaxed text-muted-foreground">
            {config.helperIntro}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {config.helperIntro}
          </p>
          {firstChild ?? null}
        </>
      )}
      {remainingChildren}
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
  return (
    <SettingsPageContent page={page} padding="page">
      <div className={cn("space-y-5", className)}>
        {backLink ? <div>{backLink}</div> : null}
        {children}
      </div>
    </SettingsPageContent>
  );
}
