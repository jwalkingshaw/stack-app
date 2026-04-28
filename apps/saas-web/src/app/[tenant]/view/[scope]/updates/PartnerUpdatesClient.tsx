"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageContentContainer } from "@/components/ui/page-content-container";
import {
  formatPublishedDateTime,
  type PublishedUpdatesResponse,
} from "@/lib/published-client";

interface PartnerUpdatesClientProps {
  tenantSlug: string;
  scope: string;
}

function normalizeScope(scope: string, tenantSlug: string) {
  const normalizedScope = scope.trim().toLowerCase();
  const normalizedTenant = tenantSlug.trim().toLowerCase();
  if (
    !normalizedScope ||
    normalizedScope === "self" ||
    normalizedScope === "all" ||
    normalizedScope === normalizedTenant
  ) {
    return null;
  }
  return normalizedScope;
}

export function PartnerUpdatesClient({ tenantSlug, scope }: PartnerUpdatesClientProps) {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PublishedUpdatesResponse["updates"]>([]);
  const brandSlug = useMemo(() => normalizeScope(scope, tenantSlug), [scope, tenantSlug]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!brandSlug) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/published/brands/${brandSlug}/updates`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | PublishedUpdatesResponse
          | null;
        if (!response.ok || !payload || !active) {
          if (active) setRows([]);
          return;
        }
        setRows(payload.updates || []);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [brandSlug]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.profile, row.market_id, row.locale_id, row.publish_version]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <PageHeader title="Updates" />
      <PageContentContainer mode="form" padding="page">
        <div className="rounded-lg border border-border bg-white p-4">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search publish updates"
            className="max-w-sm"
          />

          <div className="mt-4 space-y-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`published-update-loading-${index}`}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="animate-pulse space-y-2">
                    <div className="h-4 w-56 rounded bg-muted" />
                    <div className="h-3 w-40 rounded bg-muted" />
                    <div className="h-3 w-full rounded bg-muted" />
                  </div>
                </div>
              ))
            ) : filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published updates available.</p>
            ) : (
              filteredRows.map((row) => (
                <Link
                  key={row.id}
                  href={`/${tenantSlug}/view/${scope}/updates/${row.id}`}
                  className="block rounded-lg border border-border p-3 hover:bg-muted/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {row.profile || "Published update"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Published {formatPublishedDateTime(row.published_at)}
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">
                      {row.publish_state}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span>Locale: {row.locale_id || "default"}</span>
                    <span>Market: {row.market_id || "default"}</span>
                    <span>Version: {row.publish_version}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </PageContentContainer>
    </div>
  );
}

