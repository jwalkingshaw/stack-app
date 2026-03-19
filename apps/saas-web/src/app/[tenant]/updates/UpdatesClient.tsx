"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { PageContentContainer } from "@/components/ui/page-content-container";

type UpdateAnalytics = {
  total: number;
  opened: number;
  acknowledged: number;
  activated: number;
} | null;

type UpdateRow = {
  id: string;
  title: string;
  summary: string | null;
  urgency: "low" | "normal" | "high" | "critical";
  status: "draft" | "scheduled" | "published" | "archived" | "canceled";
  due_at: string | null;
  published_at: string | null;
  scheduled_for: string | null;
  updated_at: string;
  analytics: UpdateAnalytics;
};

interface UpdatesClientProps {
  tenantSlug: string;
}

function formatDateShort(input: string | null): string {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

// Linear-style priority icons
function PriorityIcon({ urgency }: { urgency: string }) {
  if (urgency === "critical") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="12" height="12" rx="2.5" fill="#ef4444" />
        <rect x="6.25" y="3.5" width="1.5" height="4.5" rx="0.75" fill="white" />
        <rect x="6.25" y="9.5" width="1.5" height="1.5" rx="0.75" fill="white" />
      </svg>
    );
  }

  // Ascending bar chart — 3 bars anchored to bottom of 14px viewBox
  const BAR_W = 3;
  const GAP = 1.5;
  const MAX_H = 10;
  const BASE_Y = 13; // bottom anchor

  const heights =
    urgency === "high"
      ? [MAX_H, MAX_H, MAX_H]
      : urgency === "normal"
        ? [4, 7, MAX_H]
        : [2, 4, 6]; // low

  const color =
    urgency === "high" ? "#f97316" : urgency === "normal" ? "#94a3b8" : "#cbd5e1";

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      {heights.map((h, i) => (
        <rect
          key={i}
          x={1 + i * (BAR_W + GAP)}
          y={BASE_Y - h}
          width={BAR_W}
          height={h}
          rx="0.75"
          fill={color}
        />
      ))}
    </svg>
  );
}

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

const STATUS_PILL: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-800 border-emerald-300",
  scheduled: "bg-violet-100 text-violet-800 border-violet-300",
  archived: "bg-zinc-100 text-zinc-700 border-zinc-300",
  canceled: "bg-rose-100 text-rose-800 border-rose-300",
  draft: "bg-amber-100 text-amber-800 border-amber-300",
};

function contextDate(row: UpdateRow): string {
  if (row.status === "scheduled" && row.scheduled_for) return formatDateShort(row.scheduled_for);
  if (row.status === "published" && row.published_at) return formatDateShort(row.published_at);
  if (row.due_at) return `Due ${formatDateShort(row.due_at)}`;
  return "—";
}

export function UpdatesClient({ tenantSlug }: UpdatesClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UpdateRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    summary: "",
    urgency: "normal",
    eventLabel: "",
    dueAt: "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchUpdates = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("pageSize", "200");
      if (statusFilter !== "all") query.set("status", statusFilter);
      if (urgencyFilter !== "all") query.set("urgency", urgencyFilter);
      if (search.trim()) query.set("search", search.trim());
      const response = await fetch(`/api/${tenantSlug}/updates?${query.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setRows([]);
        return;
      }
      const payload = await response.json();
      setRows(Array.isArray(payload.data) ? payload.data : []);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter, urgencyFilter, search, tenantSlug]);

  useEffect(() => {
    void fetchUpdates();
  }, [fetchUpdates]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.trim().toLowerCase();
    return rows.filter((row) => row.title.toLowerCase().includes(term));
  }, [rows, search]);

  const handleCreate = async () => {
    const title = createForm.title.trim();
    if (!title) {
      setErrorMessage("Title is required.");
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary: createForm.summary.trim() || null,
          urgency: createForm.urgency,
          eventLabel: createForm.eventLabel.trim() || null,
          dueAt: createForm.dueAt ? new Date(createForm.dueAt).toISOString() : null,
          status: "draft",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload.error || "Failed to create update.");
        return;
      }

      const updateId = payload?.data?.id;
      if (updateId) {
        router.push(`/${tenantSlug}/updates/${updateId}`);
        return;
      }

      setIsCreateDialogOpen(false);
      await fetchUpdates(true);
    } finally {
      setIsCreating(false);
    }
  };

  const openCreateDialog = () => {
    setCreateForm({ title: "", summary: "", urgency: "normal", eventLabel: "", dueAt: "" });
    setErrorMessage(null);
    setIsCreateDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner Updates"
        description="Draft, schedule, and publish kit updates for partner recipients."
      />

      <PageContentContainer mode="form" padding="page">
        {/* Toolbar row — above the table card */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-nowrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search updates..."
              className="h-9 w-56"
            />
            <select
              value={urgencyFilter}
              onChange={(event) => setUrgencyFilter(event.target.value)}
              className="h-9 rounded-lg border border-muted/30 bg-background px-3 text-sm shadow-soft"
            >
              <option value="all">All priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 rounded-lg border border-muted/30 bg-background px-3 text-sm shadow-soft"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
          <Button onClick={openCreateDialog} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            New Update
          </Button>
        </div>

        {/* Table card */}
        <div className="rounded-lg border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-[26px] px-3 py-2.5" />
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Update
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Date
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Recipients
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Opened
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Acknowledged
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`loading-row-${index}`} className="border-b border-border/60">
                      <td className="px-3 py-3">
                        <div className="h-3.5 w-3.5 animate-pulse rounded bg-gray-200" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="animate-pulse space-y-1.5">
                          <div className="h-4 w-48 rounded bg-gray-200" />
                          <div className="h-3 w-32 rounded bg-gray-200" />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="h-5 w-20 animate-pulse rounded-full bg-gray-200" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="ml-auto h-4 w-8 animate-pulse rounded bg-gray-200" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="ml-auto h-4 w-10 animate-pulse rounded bg-gray-200" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="ml-auto h-4 w-10 animate-pulse rounded bg-gray-200" />
                      </td>
                    </tr>
                  ))
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No updates found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const stats = row.analytics;
                    const isLive = row.status === "published" || row.status === "scheduled";
                    return (
                      <tr key={row.id} className="border-b border-border/60 hover:bg-muted/20">
                        {/* Priority icon */}
                        <td className="px-3 py-3">
                          <div title={PRIORITY_LABEL[row.urgency] ?? row.urgency}>
                            <PriorityIcon urgency={row.urgency} />
                          </div>
                        </td>

                        {/* Title + summary */}
                        <td className="px-3 py-3">
                          <div className="min-w-0">
                            <Link
                              href={`/${tenantSlug}/updates/${row.id}`}
                              className="font-medium text-foreground hover:underline"
                            >
                              {row.title}
                            </Link>
                            {row.summary ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                {row.summary}
                              </p>
                            ) : null}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_PILL[row.status] ?? STATUS_PILL.draft}`}
                          >
                            {row.status}
                          </span>
                        </td>

                        {/* Contextual date */}
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {contextDate(row)}
                        </td>

                        {/* Recipients */}
                        <td className="px-3 py-3 text-right text-sm">
                          {isLive && stats ? (
                            <span className="font-medium text-foreground">{stats.total}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Opened % */}
                        <td className="px-3 py-3 text-right text-sm">
                          {isLive && stats && stats.total > 0 ? (
                            <span className="font-medium text-foreground">
                              {pct(stats.opened, stats.total)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Acknowledged % */}
                        <td className="px-3 py-3 text-right text-sm">
                          {isLive && stats && stats.total > 0 ? (
                            <span className={`font-medium ${
                              stats.acknowledged / stats.total >= 0.8
                                ? "text-emerald-700"
                                : stats.acknowledged > 0
                                  ? "text-amber-700"
                                  : "text-muted-foreground"
                            }`}>
                              {pct(stats.acknowledged, stats.total)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PageContentContainer>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="e.g. Spring Launch Kit"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">Summary <span className="font-normal">(optional)</span></label>
              <Input
                value={createForm.summary}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, summary: event.target.value }))
                }
                placeholder="Short description shown in the list"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">Priority</label>
                <Select
                  value={createForm.urgency}
                  onValueChange={(value) =>
                    setCreateForm((current) => ({ ...current, urgency: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">Due date <span className="font-normal">(optional)</span></label>
                <Input
                  type="date"
                  value={createForm.dueAt}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, dueAt: event.target.value }))
                  }
                  className="text-foreground [color-scheme:light]"
                />
              </div>
            </div>
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
