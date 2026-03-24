"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, ExternalLink, FileText, Link2, Package, Rocket, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { PageHeader } from "@/components/ui/page-header";

type UpdateDetail = {
  update: {
    id: string;
    title: string;
    summary: string | null;
    urgency: string;
    status: string;
    dueAt: string | null;
    publishedAt: string | null;
    messageJson: Record<string, unknown>;
    isActionable: boolean;
  };
  brand: {
    id: string;
    name: string | null;
    slug: string | null;
  };
  recipient: {
    id: string;
    status: string;
    openedAt: string | null;
    acknowledgedAt: string | null;
    activatedAt: string | null;
  };
  kitItems: Array<{
    id: string;
    item_type: string;
    title: string | null;
    description: string | null;
    url: string | null;
    product_id: string | null;
    asset_id: string | null;
    content_json?: Record<string, unknown> | null;
    is_available?: boolean;
    unavailable_reason?: string | null;
    unavailable_message?: string | null;
  }>;
  productLookup?: Record<string, { name: string | null; sku: string | null; type: string | null }>;
  assetLookup?: Record<string, { filename: string | null; fileType: string | null; mimeType: string | null }>;
};

interface PartnerUpdateDetailClientProps {
  tenantSlug: string;
  scope: string;
  updateId: string;
}

function formatDate(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const URGENCY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  normal: "bg-blue-50 text-blue-700 border-blue-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

function UrgencyBadge({ urgency }: { urgency: string }) {
  const colorClass = URGENCY_COLORS[urgency.toLowerCase()] ?? URGENCY_COLORS.normal;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${colorClass}`}>
      {urgency}
    </span>
  );
}

function extractTextContent(contentJson: Record<string, unknown> | null | undefined): string | null {
  if (!contentJson) return null;
  const text = contentJson.text;
  if (typeof text === "string" && text.trim()) return text.trim();
  const body = contentJson.body;
  if (typeof body === "string" && body.trim()) return body.trim();
  return null;
}

export function PartnerUpdateDetailClient({
  tenantSlug,
  scope,
  updateId,
}: PartnerUpdateDetailClientProps) {
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<"acknowledge" | "activate" | null>(null);
  const [data, setData] = useState<UpdateDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/${tenantSlug}/view/${scope}/updates/${updateId}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload.error || "Failed to load update.");
        setData(null);
        return;
      }
      setData(payload.data || null);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, scope, updateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const messageBodyHtml = useMemo(() => {
    const bodyHtml = (data?.update?.messageJson as Record<string, unknown> | undefined)?.body_html;
    if (typeof bodyHtml === "string" && bodyHtml.trim()) return bodyHtml;
    return null;
  }, [data?.update?.messageJson]);

  const messageBlocks = useMemo(() => {
    if (messageBodyHtml) return [];
    const blocks = (data?.update?.messageJson as { blocks?: unknown })?.blocks;
    if (!Array.isArray(blocks)) return [];
    return blocks
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        const text = typeof row.text === "string" ? row.text.trim() : "";
        return text ? text : null;
      })
      .filter((value): value is string => Boolean(value));
  }, [data?.update?.messageJson, messageBodyHtml]);

  const runAction = async (action: "acknowledge" | "activate") => {
    setRunningAction(action);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(
        `/api/${tenantSlug}/view/${scope}/updates/${updateId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload.error || `Failed to ${action}.`);
        return;
      }
      setSuccessMessage(action === "acknowledge" ? "Acknowledged." : "Marked as activated.");
      await load();
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <PageContentContainer mode="form" padding="page" className="space-y-4">
      <PageHeader
        title="Update"
        backHref={`/${tenantSlug}/view/${scope}/updates`}
        backLabel="Back to Updates"
        sticky={false}
      />

      {loading ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-white p-5">
              <div className="animate-pulse space-y-4">
                <div className="h-7 w-64 rounded bg-gray-200" />
                <div className="h-4 w-96 max-w-full rounded bg-gray-200" />
                <div className="h-16 w-full rounded bg-gray-200" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={`meta-skeleton-${index}`} className="space-y-2">
                      <div className="h-3 w-20 rounded bg-gray-200" />
                      <div className="h-4 w-20 rounded bg-gray-200" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="h-9 w-28 rounded bg-gray-200" />
                  <div className="h-9 w-32 rounded bg-gray-200" />
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-white p-5">
              <div className="animate-pulse space-y-3">
                <div className="h-5 w-28 rounded bg-gray-200" />
                <div className="h-14 w-full rounded bg-gray-200" />
                <div className="h-14 w-full rounded bg-gray-200" />
              </div>
            </div>
          </div>
      ) : !data ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            {errorMessage || "Update not found."}
          </div>
      ) : (
          <div className="space-y-4">
            {/* Header card */}
            <div className="rounded-lg border border-border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-semibold text-foreground">{data.update.title}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.brand.name || data.brand.slug || "Brand"}
                  </p>
                </div>
                <UrgencyBadge urgency={data.update.urgency} />
              </div>

              {data.update.summary ? (
                <p className="mt-3 text-sm text-muted-foreground">{data.update.summary}</p>
              ) : null}

              {/* Message body */}
              {messageBodyHtml ? (
                <div className="mt-4 rounded-md border border-border bg-muted/20 p-4 text-sm text-foreground"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: messageBodyHtml }}
                />
              ) : messageBlocks.length > 0 ? (
                <div className="mt-4 space-y-2 rounded-md border border-border bg-muted/20 p-4 text-sm">
                  {messageBlocks.map((block, index) => (
                    <p key={`${index}-${block.slice(0, 10)}`}>{block}</p>
                  ))}
                </div>
              ) : null}

              {/* Metadata grid */}
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Published</p>
                  <p className="font-medium">{formatDate(data.update.publishedAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due</p>
                  <p className={`font-medium ${
                    data.update.dueAt && new Date(data.update.dueAt) < new Date() && !data.recipient.activatedAt
                      ? "text-red-600"
                      : ""
                  }`}>
                    {formatDate(data.update.dueAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Acknowledged</p>
                  <p className="font-medium">
                    {data.recipient.acknowledgedAt
                      ? formatDate(data.recipient.acknowledgedAt)
                      : <span className="text-muted-foreground">—</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Activated</p>
                  <p className="font-medium">
                    {data.recipient.activatedAt
                      ? formatDate(data.recipient.activatedAt)
                      : <span className="text-muted-foreground">—</span>}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              {data.update.isActionable ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    className="gap-2"
                    onClick={() => void runAction("acknowledge")}
                    disabled={runningAction !== null || Boolean(data.recipient.acknowledgedAt)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {data.recipient.acknowledgedAt
                      ? "Acknowledged"
                      : runningAction === "acknowledge"
                        ? "Saving..."
                        : "Acknowledge"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={() => void runAction("activate")}
                    disabled={runningAction !== null || Boolean(data.recipient.activatedAt)}
                  >
                    <Rocket className="h-4 w-4" />
                    {data.recipient.activatedAt
                      ? "Activated"
                      : runningAction === "activate"
                        ? "Saving..."
                        : "Mark Activated"}
                  </Button>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  Informational announcement only. No acknowledgment required.
                </div>
              )}

              {errorMessage ? <p className="mt-3 text-sm text-destructive">{errorMessage}</p> : null}
              {successMessage ? <p className="mt-3 text-sm text-emerald-700">{successMessage}</p> : null}
            </div>

            {/* Kit Contents */}
            <div className="rounded-lg border border-border bg-white p-5">
              <h2 className="text-base font-semibold text-foreground">Kit Contents</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Products and assets included in this update.
              </p>
              {data.kitItems.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No kit contents attached.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {data.kitItems.map((item) => {
                    const product = item.product_id ? (data.productLookup ?? {})[item.product_id] : null;
                    const asset = item.asset_id ? (data.assetLookup ?? {})[item.asset_id] : null;
                    const textContent = item.item_type === "text" ? extractTextContent(item.content_json) : null;
                    const isAvailable = item.is_available !== false;

                    if (item.item_type === "product") {
                      const productName = product?.name ?? item.title ?? "Product";
                      const productType = product?.type ?? null;
                      return (
                        <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/20">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50">
                            <Package className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-foreground">{productName}</p>
                              {productType ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  {productType}
                                </Badge>
                              ) : null}
                              {product?.sku ? (
                                <span className="text-xs text-muted-foreground">SKU: {product.sku}</span>
                              ) : null}
                            </div>
                            {item.description ? (
                              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                            ) : null}
                            {!isAvailable ? (
                              <p className="mt-1 text-xs text-amber-700">
                                {item.unavailable_message || "This product is unavailable for your current access."}
                              </p>
                            ) : null}
                          </div>
                          {item.product_id && isAvailable ? (
                            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
                              <Link href={`/${tenantSlug}/view/${scope}/products/${item.product_id}`}>
                                View Product
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          ) : !isAvailable ? (
                            <Badge variant="secondary" className="shrink-0">Unavailable</Badge>
                          ) : null}
                        </div>
                      );
                    }

                    if (item.item_type === "asset") {
                      const filename = asset?.filename ?? item.title ?? "Asset";
                      const fileType = asset?.fileType ?? null;
                      return (
                        <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/20">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-purple-50">
                            <FileText className="h-4 w-4 text-purple-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-foreground">{filename}</p>
                              {fileType ? (
                                <Badge variant="secondary" className="text-[10px] uppercase">
                                  {fileType.replace(/^\./, "")}
                                </Badge>
                              ) : null}
                            </div>
                            {item.description ? (
                              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                            ) : null}
                            {!isAvailable ? (
                              <p className="mt-1 text-xs text-amber-700">
                                {item.unavailable_message || "This asset is unavailable for your current access."}
                              </p>
                            ) : null}
                          </div>
                          {item.asset_id && isAvailable ? (
                            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
                              <Link href={`/api/${tenantSlug}/assets/${item.asset_id}/preview`} target="_blank" rel="noreferrer">
                                <Download className="h-3.5 w-3.5" />
                                Download
                              </Link>
                            </Button>
                          ) : !isAvailable ? (
                            <Badge variant="secondary" className="shrink-0">Unavailable</Badge>
                          ) : null}
                        </div>
                      );
                    }

                    if (item.item_type === "url" && item.url) {
                      return (
                        <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/20">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-green-50">
                            <Link2 className="h-4 w-4 text-green-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">{item.title || "Link"}</p>
                            {item.description ? (
                              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                            ) : null}
                            <p className="mt-1 truncate text-xs text-muted-foreground">{item.url}</p>
                          </div>
                          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
                            <Link href={item.url} target="_blank" rel="noreferrer">
                              Open Link
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                      );
                    }

                    if (item.item_type === "text" && textContent) {
                      return (
                        <div key={item.id} className="rounded-lg border border-border p-4">
                          {item.title ? (
                            <p className="mb-2 text-sm font-medium text-foreground">{item.title}</p>
                          ) : null}
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{textContent}</p>
                        </div>
                      );
                    }

                    if (item.item_type === "email") {
                      const cj = item.content_json ?? {};
                      const label = item.title || (typeof cj.label === "string" ? cj.label : null) || "Email";
                      const subjectLine = typeof cj.subjectLine === "string" ? cj.subjectLine : null;
                      const headline = typeof cj.headline === "string" ? cj.headline : null;
                      const bodyCopy = typeof cj.bodyCopy === "string" ? cj.bodyCopy : null;
                      const ctaLabel = typeof cj.ctaLabel === "string" ? cj.ctaLabel : null;
                      return (
                        <div key={item.id} className="overflow-hidden rounded-lg border border-border">
                          <div className="flex items-center gap-2.5 border-b border-border bg-muted/20 px-4 py-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-100">
                              <svg className="h-3.5 w-3.5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">{label}</p>
                              <p className="text-xs text-muted-foreground">Email template</p>
                            </div>
                          </div>
                          <div className="space-y-1 p-4 text-sm">
                            {subjectLine ? <p className="text-xs text-muted-foreground">Subject: <span className="font-medium text-foreground">{subjectLine}</span></p> : null}
                            {headline ? <p className="font-semibold text-foreground">{headline}</p> : null}
                            {bodyCopy ? <p className="text-muted-foreground line-clamp-3">{bodyCopy}</p> : null}
                            {ctaLabel ? (
                              <p className="pt-1">
                                <span className="inline-flex items-center rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background">{ctaLabel}</span>
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    if (item.item_type === "social") {
                      const cj = item.content_json ?? {};
                      const label = item.title || (typeof cj.label === "string" ? cj.label : null) || "Social Post";
                      const caption = typeof cj.caption === "string" ? cj.caption : null;
                      return (
                        <div key={item.id} className="overflow-hidden rounded-lg border border-border">
                          <div className="flex items-center gap-2.5 border-b border-border bg-muted/20 px-4 py-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-pink-100">
                              <svg className="h-3.5 w-3.5 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">{label}</p>
                              <p className="text-xs text-muted-foreground">Social post</p>
                            </div>
                          </div>
                          {caption ? (
                            <p className="p-4 text-sm text-foreground whitespace-pre-wrap">{caption}</p>
                          ) : null}
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              )}
            </div>
          </div>
      )}
    </PageContentContainer>
  );
}
