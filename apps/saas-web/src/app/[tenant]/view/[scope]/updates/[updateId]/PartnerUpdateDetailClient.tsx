"use client";

import { useEffect, useMemo, useState } from "react";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  formatPublishedDateTime,
  type PublishedPublishResponse,
} from "@/lib/published-client";

interface PartnerUpdateDetailClientProps {
  tenantSlug: string;
  scope: string;
  updateId: string;
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

function renderRecord(record: Record<string, unknown> | null) {
  if (!record || Object.keys(record).length === 0) {
    return <p className="text-sm text-muted-foreground">No data captured.</p>;
  }

  return (
    <div className="space-y-2">
      {Object.entries(record).map(([key, value]) => (
        <div key={key} className="rounded-md border border-border/60 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
          <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
            {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

export function PartnerUpdateDetailClient({
  tenantSlug,
  scope,
  updateId,
}: PartnerUpdateDetailClientProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublishedPublishResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const brandSlug = useMemo(() => normalizeScope(scope, tenantSlug), [scope, tenantSlug]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!brandSlug) {
        setLoading(false);
        setErrorMessage("A published brand scope is required.");
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/published/brands/${brandSlug}/publishes/${updateId}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | PublishedPublishResponse
          | null;
        if (!response.ok || !payload) {
          throw new Error("Failed to load publish.");
        }
        if (!active) return;
        setData(payload);
      } catch (caughtError) {
        if (!active) return;
        setData(null);
        setErrorMessage(caughtError instanceof Error ? caughtError.message : "Failed to load publish.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [brandSlug, updateId]);

  return (
    <PageContentContainer mode="form" padding="page" className="space-y-4">
      <PageHeader
        title="Published Update"
        backHref={`/${tenantSlug}/view/${scope}/updates`}
        backLabel="Back to Updates"
        sticky={false}
      />

      {loading ? (
        <div className="rounded-lg border border-border bg-white p-5">
          <div className="animate-pulse space-y-3">
            <div className="h-6 w-56 rounded bg-muted" />
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-32 rounded bg-muted" />
          </div>
        </div>
      ) : errorMessage || !data ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {errorMessage || "Publish not found."}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {data.brand.name}
                </p>
                <h1 className="text-xl font-semibold text-foreground">
                  {data.publish.profile || "Published update"}
                </h1>
              </div>
              <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">
                {data.publish.publish_state}
              </span>
            </div>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Published</p>
                <p className="font-medium text-foreground">
                  {formatPublishedDateTime(data.publish.published_at)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Locale</p>
                <p className="font-medium text-foreground">{data.publish.locale_id || "default"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Market</p>
                <p className="font-medium text-foreground">{data.publish.market_id || "default"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Version</p>
                <p className="break-all font-medium text-foreground">{data.publish.publish_version}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-foreground">Readiness Snapshot</h2>
              <div className="mt-3">
                {renderRecord(data.publish.readiness_snapshot)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-foreground">Scope Metadata</h2>
              <div className="mt-3">
                {renderRecord(data.publish.scope_metadata)}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContentContainer>
  );
}

