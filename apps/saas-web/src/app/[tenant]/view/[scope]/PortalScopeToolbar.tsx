"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ScopeToolbar } from "@/components/scope-toolbar";
import { useMarketContext } from "@/components/market-context";

interface PortalScopeToolbarProps {
  title?: string;
  description?: string;
  rightSlot?: ReactNode;
}

function normalizeToken(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function PortalScopeToolbar({
  title = "Portal Context",
  description = "Markets define the regional context. Locale picks the language version inside that market.",
  rightSlot,
}: PortalScopeToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isReady, selectedMarket, selectedLocale } = useMarketContext();

  const selectedMarketCode = selectedMarket?.code ?? "";
  const selectedLocaleCode = selectedLocale?.code ?? "";

  useEffect(() => {
    if (!isReady) return;

    const next = new URLSearchParams(searchParams.toString());
    let changed = false;

    if (normalizeToken(next.get("market")) !== normalizeToken(selectedMarketCode)) {
      if (selectedMarketCode) next.set("market", selectedMarketCode);
      else next.delete("market");
      changed = true;
    }

    if (normalizeToken(next.get("locale")) !== normalizeToken(selectedLocaleCode)) {
      if (selectedLocaleCode) next.set("locale", selectedLocaleCode);
      else next.delete("locale");
      changed = true;
    }

    if (!changed) return;

    const nextQuery = next.toString();
    router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`);
  }, [isReady, pathname, router, searchParams, selectedLocaleCode, selectedMarketCode]);

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {selectedMarket?.name || "No market"} | {selectedLocale?.name || "No locale"}
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          {rightSlot}
          <ScopeToolbar />
        </div>
      </div>
    </div>
  );
}
