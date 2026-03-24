"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageContentContainer } from "@/components/ui/page-content-container";

type PartnerUpdateRow = {
  recipient: {
    id: string;
    status: string;
    openedAt: string | null;
    acknowledgedAt: string | null;
    activatedAt: string | null;
    dueAt: string | null;
  };
  update: {
    id: string;
    title: string;
    summary: string | null;
    urgency: string;
    dueAt: string | null;
    publishedAt: string | null;
    isActionable?: boolean;
  };
  brand: {
    id: string;
    name: string | null;
    slug: string | null;
  };
};

interface PartnerUpdatesClientProps {
  tenantSlug: string;
  scope: string;
}

function formatDate(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export function PartnerUpdatesClient({ tenantSlug, scope }: PartnerUpdatesClientProps) {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PartnerUpdateRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchRows = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("pageSize", "200");
      if (statusFilter !== "all") query.set("status", statusFilter);
      if (search.trim()) query.set("search", search.trim());

      const response = await fetch(
        `/api/${tenantSlug}/view/${scope}/updates?${query.toString()}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        setRows([]);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      setRows(Array.isArray(payload.data) ? payload.data : []);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter, search, tenantSlug, scope]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.trim().toLowerCase();
    return rows.filter((row) => row.update.title.toLowerCase().includes(term));
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Updates"
      />
      <PageContentContainer mode="form" padding="page">
        <div className="rounded-lg border border-border bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search updates"
              className="max-w-sm"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-8 rounded-lg border border-muted/30 bg-background px-3 text-sm shadow-soft"
            >
              <option value="all">All statuses</option>
              <option value="queued">Queued</option>
              <option value="notified">Notified</option>
              <option value="opened">Opened</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="activated">Activated</option>
            </select>
          </div>

          <div className="mt-4 space-y-2">
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={`partner-update-loading-${index}`}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="animate-pulse space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-2">
                        <div className="h-4 w-56 rounded bg-gray-200" />
                        <div className="h-3 w-44 rounded bg-gray-200" />
                      </div>
                      <div className="h-5 w-20 rounded-full bg-gray-200" />
                    </div>
                    <div className="h-3 w-full rounded bg-gray-200" />
                    <div className="h-3 w-10/12 rounded bg-gray-200" />
                    <div className="flex gap-3">
                      <div className="h-3 w-20 rounded bg-gray-200" />
                      <div className="h-3 w-20 rounded bg-gray-200" />
                      <div className="h-3 w-20 rounded bg-gray-200" />
                    </div>
                  </div>
                </div>
              ))
            ) : filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No updates available.</p>
            ) : (
              filteredRows.map((row) => (
                <Link
                  key={row.recipient.id}
                  href={`/${tenantSlug}/view/${scope}/updates/${row.update.id}`}
                  className="block rounded-lg border border-border p-3 hover:bg-muted/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{row.update.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.brand.name || row.brand.slug || "Brand"} | urgency {row.update.urgency}
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">
                      {row.recipient.status}
                    </span>
                  </div>
                  {row.update.summary ? (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.update.summary}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span>Due: {formatDate(row.update.dueAt)}</span>
                    <span>Published: {formatDate(row.update.publishedAt)}</span>
                    <span>Ack: {row.recipient.acknowledgedAt ? "Yes" : "No"}</span>
                    <span>Activated: {row.recipient.activatedAt ? "Yes" : "No"}</span>
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
