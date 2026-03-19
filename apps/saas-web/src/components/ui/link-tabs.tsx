"use client";

import * as React from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type LinkTabsListProps = React.ComponentPropsWithoutRef<typeof TabsList>;
type LinkTabsTriggerProps = React.ComponentPropsWithoutRef<typeof TabsTrigger>;

const LinkTabsList = React.forwardRef<HTMLDivElement, LinkTabsListProps>(
  ({ className, ...props }, ref) => (
    <TabsList
      ref={ref}
      className={cn(
        "h-auto w-full justify-start gap-5 rounded-none border-b border-border/70 bg-transparent p-0",
        className
      )}
      {...props}
    />
  )
);

LinkTabsList.displayName = "LinkTabsList";

const LinkTabsTrigger = React.forwardRef<HTMLButtonElement, LinkTabsTriggerProps>(
  ({ className, ...props }, ref) => (
    <TabsTrigger
      ref={ref}
      className={cn(
        "h-9 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 pt-0 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-[var(--color-accent-blue)] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
        className
      )}
      {...props}
    />
  )
);

LinkTabsTrigger.displayName = "LinkTabsTrigger";

export { LinkTabsList, LinkTabsTrigger };
