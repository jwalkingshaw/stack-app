"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckCheck, X, Languages } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { cn } from "@/lib/utils";
import { getLocaleShortName } from "@/lib/locale-utils";
import { toast } from "@/components/ui/toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type ItemStatus = "queued" | "generated" | "reviewed" | "approved" | "rejected" | "applied" | "failed" | "stale";

interface TranslationItem {
  id: string;
  job_id: string;
  product_id: string;
  field_code: string;
  source_value: Record<string, unknown> | null;
  suggested_value: Record<string, unknown> | null;
  edited_value: Record<string, unknown> | null;
  final_value: Record<string, unknown> | null;
  status: ItemStatus;
  target_scope: Record<string, unknown> | null;
  error_message: string | null;
  created_at?: string;
}

interface LocaleInfo { id: string; code: string; name: string }
interface MarketInfo { id: string; name: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  product_name: "Product Name",
  short_description: "Short Description",
  long_description: "Long Description",
  features: "Features",
  meta_title: "Meta Title",
  meta_description: "Meta Description",
  keywords: "Keywords",
};

function getFieldLabel(code: string) {
  return FIELD_LABELS[code] ?? code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractText(value: Record<string, unknown> | null | undefined): string {
  if (!value) return "";
  if (typeof value.text === "string") return value.text;
  return "";
}

const REVIEWABLE = new Set<ItemStatus>(["generated", "reviewed", "approved", "stale"]);

// ─── Row ─────────────────────────────────────────────────────────────────────

interface RowProps {
  item: TranslationItem;
  scopeLabel: string;
  editedText: string;
  onTextChange: (text: string) => void;
  onApproveApply: () => void;
  onReject: () => void;
  submitting: boolean;
  isLast: boolean;
}

function TranslationRow({ item, scopeLabel, editedText, onTextChange, onApproveApply, onReject, submitting, isLast }: RowProps) {
  const sourceText = extractText(item.source_value);

  return (
    <div className={cn("px-4 py-3", !isLast && "border-b border-gray-100")}>
      {/* Field label + scope */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs font-medium text-foreground">{getFieldLabel(item.field_code)}</span>
        {scopeLabel && (
          <span className="text-xs text-muted-foreground">· {scopeLabel}</span>
        )}
      </div>

      {/* Source / Translation two-column */}
      <div className="grid grid-cols-2 gap-3">
        <div className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
          {sourceText || <span className="italic">No source text</span>}
        </div>
        <textarea
          value={editedText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Translation…"
          rows={2}
          disabled={submitting}
          className="w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {item.error_message && (
        <p className="mt-1.5 text-xs text-red-500">{item.error_message}</p>
      )}

      <div className="flex items-center justify-end gap-1.5 mt-2">
        <button
          type="button"
          onClick={onReject}
          disabled={submitting}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-40"
        >
          <X className="h-3 w-3" />
          Reject
        </button>
        <Button
          type="button"
          size="sm"
          onClick={onApproveApply}
          disabled={submitting || !editedText.trim()}
          className="h-7 text-xs px-2.5"
        >
          {submitting ? <LoadingSkeleton size="sm" /> : <Check className="h-3 w-3 mr-1" />}
          Apply
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface TranslationReviewSheetProps {
  tenantSlug: string;
  productId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TranslationReviewSheet({ tenantSlug, productId, open, onOpenChange }: TranslationReviewSheetProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type JobWithItems = { job: Record<string, unknown>; items: TranslationItem[] };
  const [jobsWithItems, setJobsWithItems] = useState<JobWithItems[]>([]);
  const [locales, setLocales] = useState<LocaleInfo[]>([]);
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

  const localeById = useMemo(() => new Map(locales.map((l) => [l.id, l])), [locales]);
  const marketById = useMemo(() => new Map(markets.map((m) => [m.id, m])), [markets]);

  // Flatten all items, deduplicate pending to most recent per field+scope, hide done items
  const deduplicatedItems = useMemo<TranslationItem[]>(() => {
    const allItems = jobsWithItems.flatMap((j) => j.items);
    const pending = allItems.filter((i) => REVIEWABLE.has(i.status));

    // Keep only the most recent pending item per field_code + scope fingerprint
    const latest = new Map<string, TranslationItem>();
    for (const item of pending) {
      const scope = item.target_scope ?? {};
      const localeId = (scope.localeId ?? scope.locale_id ?? "") as string;
      const marketId = (scope.marketId ?? scope.market_id ?? "") as string;
      const key = `${item.field_code}::${localeId}::${marketId}`;
      const existing = latest.get(key);
      if (!existing || (item.created_at ?? "") > (existing.created_at ?? "")) {
        latest.set(key, item);
      }
    }
    return [...latest.values()];
  }, [jobsWithItems]);

  const pendingItems = deduplicatedItems; // all visible items are pending
  const canBulkApply = pendingItems.length > 0 && !Object.values(submitting).some(Boolean);

  const getScopeLabel = useCallback((item: TranslationItem) => {
    const scope = item.target_scope ?? {};
    const localeId = (scope.localeId ?? scope.locale_id ?? "") as string;
    const marketId = (scope.marketId ?? scope.market_id ?? "") as string;
    const market = marketId ? marketById.get(marketId) : null;
    const locale = localeId ? localeById.get(localeId) : null;
    const localeName = locale ? getLocaleShortName(locale.name) : "";
    const parts = [market?.name, localeName].filter(Boolean);
    return parts.join(" · ");
  }, [localeById, marketById]);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, localesRes, marketsRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/localization/jobs?limit=50`),
        fetch(`/api/${tenantSlug}/locales`),
        fetch(`/api/${tenantSlug}/markets`),
      ]);

      const jobsData = jobsRes.ok ? await jobsRes.json() : null;
      const localesData = localesRes.ok ? await localesRes.json() : null;
      const marketsData = marketsRes.ok ? await marketsRes.json() : null;

      setLocales(Array.isArray(localesData) ? localesData : (localesData?.data ?? []));
      setMarkets(Array.isArray(marketsData) ? marketsData : (marketsData?.data ?? []));

      const jobs: Array<Record<string, unknown>> = jobsData?.data?.jobs ?? [];
      const relevantJobs = jobs.filter((job) => {
        const ids = Array.isArray(job.product_ids) ? job.product_ids as string[] : [];
        return ids.includes(productId) &&
          (job.status === "review_required" || job.status === "completed");
      });

      const jobDetails = await Promise.all(
        relevantJobs.map(async (job) => {
          const res = await fetch(`/api/${tenantSlug}/localization/jobs/${job.id}`);
          if (!res.ok) return null;
          const data = await res.json();
          const items: TranslationItem[] = (data?.data?.items ?? []).filter(
            (item: TranslationItem) => item.product_id === productId
          );
          return { job, items };
        })
      );

      const results = jobDetails.filter(Boolean) as JobWithItems[];
      setJobsWithItems(results);

      const initialTexts: Record<string, string> = {};
      for (const { items } of results) {
        for (const item of items) {
          initialTexts[item.id] =
            extractText(item.edited_value) ||
            extractText(item.final_value) ||
            extractText(item.suggested_value);
        }
      }
      setEditedTexts(initialTexts);
    } catch (err) {
      console.error("Failed to load translation review data:", err);
      setError("Failed to load. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, productId]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  // ── Actions ────────────────────────────────────────────────────────────────

  // Remove an item from the visible list and close the sheet if nothing remains
  const removeItem = useCallback((itemId: string) => {
    setJobsWithItems((prev) =>
      prev.map((j) => ({ ...j, items: j.items.filter((i) => i.id !== itemId) }))
    );
  }, []);

  const approveAndApplyItem = useCallback(async (item: TranslationItem) => {
    const text = (editedTexts[item.id] ?? "").trim();
    if (!text) return;
    setSubmitting((prev) => ({ ...prev, [item.id]: true }));
    try {
      const approveRes = await fetch(`/api/${tenantSlug}/localization/jobs/${item.job_id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", editedValue: { text } }),
      });
      if (!approveRes.ok) throw new Error("Approve failed");
      const applyRes = await fetch(`/api/${tenantSlug}/localization/jobs/${item.job_id}/items/${item.id}/apply`, { method: "POST" });
      if (!applyRes.ok) throw new Error("Apply failed");
      removeItem(item.id);
      toast.success("Translation applied");
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to apply item:", err);
      setSubmitting((prev) => ({ ...prev, [item.id]: false }));
    }
  }, [tenantSlug, editedTexts, removeItem, onOpenChange]);

  const rejectItem = useCallback(async (item: TranslationItem) => {
    setSubmitting((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await fetch(`/api/${tenantSlug}/localization/jobs/${item.job_id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      if (!res.ok) throw new Error("Reject failed");
      removeItem(item.id);
    } catch (err) {
      console.error("Failed to reject item:", err);
      setSubmitting((prev) => ({ ...prev, [item.id]: false }));
    }
  }, [tenantSlug, removeItem]);

  const bulkApproveAndApply = useCallback(async () => {
    setSubmitting((prev) => ({ ...prev, bulk: true }));
    try {
      const byJob = new Map<string, TranslationItem[]>();
      for (const item of pendingItems) {
        if (!byJob.has(item.job_id)) byJob.set(item.job_id, []);
        byJob.get(item.job_id)!.push(item);
      }
      for (const [jobId, items] of byJob.entries()) {
        const itemIds = items.map((i) => i.id);
        const editedValues: Record<string, string> = {};
        for (const item of items) {
          const text = (editedTexts[item.id] ?? "").trim() || extractText(item.suggested_value);
          if (text) editedValues[item.id] = text;
        }
        const approveRes = await fetch(`/api/${tenantSlug}/localization/jobs/${jobId}/items/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve", itemIds, editedValues }),
        });
        if (!approveRes.ok) continue;
        await fetch(`/api/${tenantSlug}/localization/jobs/${jobId}/items/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "apply", itemIds }),
        });
      }
      toast.success("Translations applied");
      onOpenChange(false);
    } catch (err) {
      console.error("Bulk apply failed:", err);
      setSubmitting((prev) => ({ ...prev, bulk: false }));
    }
  }, [tenantSlug, pendingItems, editedTexts, onOpenChange]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col overflow-hidden p-0">

        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-gray-200 px-4 py-3.5">
          <Languages className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-sm font-semibold text-foreground">Translation Review</SheetTitle>
            {pendingItems.length > 0 && (
              <p className="text-xs text-muted-foreground">{pendingItems.length} pending</p>
            )}
          </div>
        </div>

        {/* Column headers */}
        {deduplicatedItems.length > 0 && (
          <div className="grid grid-cols-2 gap-3 border-b border-gray-100 px-4 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Source</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Translation</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <LoadingSkeleton size="md" />
            </div>
          )}

          {error && !loading && (
            <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          {!loading && !error && deduplicatedItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Languages className="h-8 w-8 text-muted-foreground/30 mb-2.5" />
              <p className="text-sm font-medium text-foreground">No pending translations</p>
              <p className="text-xs text-muted-foreground mt-1">
                Run a translation for this product to review results here.
              </p>
            </div>
          )}

          {!loading && deduplicatedItems.map((item, index) => (
            <TranslationRow
              key={item.id}
              item={item}
              scopeLabel={getScopeLabel(item)}
              editedText={editedTexts[item.id] ?? ""}
              onTextChange={(text) => setEditedTexts((prev) => ({ ...prev, [item.id]: text }))}
              onApproveApply={() => approveAndApplyItem(item)}
              onReject={() => rejectItem(item)}
              submitting={!!submitting[item.id]}
              isLast={index === deduplicatedItems.length - 1}
            />
          ))}
        </div>

        {/* Footer */}
        {pendingItems.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {pendingItems.length} pending
            </span>
            <Button
              size="sm"
              onClick={bulkApproveAndApply}
              disabled={!canBulkApply || !!submitting.bulk}
              className="h-8 text-xs"
            >
              {submitting.bulk
                ? <LoadingSkeleton size="sm" className="mr-1.5" />
                : <CheckCheck className="h-3.5 w-3.5 mr-1.5" />}
              Apply All
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

