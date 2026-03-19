"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { PageHeader } from "@/components/ui/page-header";

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
    updatedAt?: string | null;
  };
  brand: {
    id: string;
    name: string | null;
    slug: string | null;
  };
};

type NotificationItem = {
  id: string;
  type:
    | "asset_added"
    | "product_added"
    | "share_granted"
    | "update_published"
    | "update_reminder";
  organizationSlug: string;
  organizationName: string;
  title: string;
  description: string;
  createdAt: string;
  href: string;
  isRead: boolean;
};

interface PartnerHomeClientProps {
  tenantSlug: string;
  scope: string;
}

function formatDate(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function formatRelative(input: string): string {
  const date = new Date(input);
  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isBrandScope(scope: string, tenantSlug: string): boolean {
  const normalizedScope = (scope || "").trim().toLowerCase();
  const normalizedTenant = (tenantSlug || "").trim().toLowerCase();
  if (!normalizedScope || normalizedScope === "all" || normalizedScope === "self") {
    return false;
  }
  return normalizedScope !== normalizedTenant;
}

export function PartnerHomeClient({ tenantSlug, scope }: PartnerHomeClientProps) {
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState<PartnerUpdateRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const normalizedScope = (scope || "").trim().toLowerCase();
  const brandScoped = isBrandScope(scope, tenantSlug);
  const scopeLabel = brandScoped ? normalizedScope : "all brands";

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const notificationQuery = new URLSearchParams();
      notificationQuery.set("limit", "60");
      notificationQuery.set("compact", "1");
      if (brandScoped) {
        notificationQuery.set("workspaceSlug", normalizedScope);
      }

      const [updatesRes, notificationsRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/view/${scope}/updates?pageSize=200`, { cache: "no-store" }),
        fetch(`/api/me/notifications?${notificationQuery.toString()}`, { cache: "no-store" }),
      ]);

      if (updatesRes.ok) {
        const payload = await updatesRes.json().catch(() => ({}));
        setUpdates(Array.isArray(payload?.data) ? payload.data : []);
      } else {
        setUpdates([]);
      }

      if (notificationsRes.ok) {
        const payload = await notificationsRes.json().catch(() => ({}));
        setNotifications(Array.isArray(payload?.notifications) ? payload.notifications : []);
      } else {
        setNotifications([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [brandScoped, normalizedScope, scope, tenantSlug]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const urgencyRank = (urgency: string): number => {
    switch ((urgency || "").toLowerCase()) {
      case "critical":
        return 4;
      case "high":
        return 3;
      case "normal":
        return 2;
      case "low":
        return 1;
      default:
        return 0;
    }
  };

  const resolveDueAt = (row: PartnerUpdateRow): string | null =>
    row.recipient.dueAt || row.update.dueAt || null;

  const resolveSortTimestamp = (row: PartnerUpdateRow): number => {
    const publishedMs = row.update.publishedAt ? Date.parse(row.update.publishedAt) : NaN;
    if (Number.isFinite(publishedMs)) return publishedMs;
    const updatedMs = row.update.updatedAt ? Date.parse(row.update.updatedAt) : NaN;
    if (Number.isFinite(updatedMs)) return updatedMs;
    return 0;
  };

  const isOverdue = useCallback((row: PartnerUpdateRow): boolean => {
    const dueAt = row.recipient.dueAt || row.update.dueAt || null;
    if (!dueAt) return false;
    const dueMs = Date.parse(dueAt);
    return Number.isFinite(dueMs) && dueMs < Date.now();
  }, []);

  const updateMetrics = useMemo(() => {
    const requiringAction = updates
      .filter(
        (row) =>
          row.recipient.status !== "acknowledged" &&
          row.recipient.status !== "activated" &&
          row.recipient.status !== "muted"
      )
      .sort((a, b) => {
        const aUrgency = urgencyRank(a.update.urgency);
        const bUrgency = urgencyRank(b.update.urgency);
        const aOverdue = isOverdue(a);
        const bOverdue = isOverdue(b);
        const aCriticalOverdue = aOverdue && aUrgency === 4;
        const bCriticalOverdue = bOverdue && bUrgency === 4;

        if (aCriticalOverdue !== bCriticalOverdue) {
          return aCriticalOverdue ? -1 : 1;
        }
        if (aOverdue !== bOverdue) {
          return aOverdue ? -1 : 1;
        }
        if (aUrgency !== bUrgency) {
          return bUrgency - aUrgency;
        }

        const aTimestamp = resolveSortTimestamp(a);
        const bTimestamp = resolveSortTimestamp(b);
        return bTimestamp - aTimestamp;
      });
    const opened = updates.filter(
      (row) =>
        row.recipient.status === "opened" ||
        row.recipient.status === "acknowledged" ||
        row.recipient.status === "activated"
    ).length;
    const acknowledged = updates.filter(
      (row) => row.recipient.status === "acknowledged" || row.recipient.status === "activated"
    ).length;
    const activated = updates.filter((row) => row.recipient.status === "activated").length;
    const overdue = requiringAction.filter((row) => isOverdue(row)).length;

    return {
      requiringAction,
      opened,
      acknowledged,
      activated,
      overdue,
    };
  }, [updates, isOverdue]);

  const assetEvents = useMemo(
    () => notifications.filter((event) => event.type === "asset_added").slice(0, 6),
    [notifications]
  );
  const productEvents = useMemo(
    () => notifications.filter((event) => event.type === "product_added").slice(0, 6),
    [notifications]
  );

  return (
    <PageContentContainer mode="form" padding="page" className="space-y-4">
      <PageHeader title="Home" sticky={false} />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Viewing <span className="font-medium text-foreground">{scopeLabel}</span>.
        </p>
      </div>

      {loading ? (
          <div className="rounded-lg border border-border bg-white p-5 text-sm text-muted-foreground">
            Loading home...
          </div>
      ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted-foreground">Updates Requiring Action</p>
                <p className="text-2xl font-semibold text-foreground">
                  {updateMetrics.requiringAction.length}
                </p>
                <p className="text-xs text-muted-foreground">{updateMetrics.overdue} overdue</p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted-foreground">Opened</p>
                <p className="text-2xl font-semibold text-foreground">{updateMetrics.opened}</p>
                <p className="text-xs text-muted-foreground">updates opened</p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted-foreground">Acknowledged</p>
                <p className="text-2xl font-semibold text-foreground">
                  {updateMetrics.acknowledged}
                </p>
                <p className="text-xs text-muted-foreground">updates acknowledged</p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted-foreground">Activated</p>
                <p className="text-2xl font-semibold text-foreground">{updateMetrics.activated}</p>
                <p className="text-xs text-muted-foreground">updates activated</p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted-foreground">Total Shared Updates</p>
                <p className="text-2xl font-semibold text-foreground">{updates.length}</p>
                <Link
                  href={`/${tenantSlug}/view/${scope}/updates`}
                  className="text-xs text-primary hover:underline"
                >
                  Open updates
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-lg border border-border bg-white p-4 xl:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Updates Requiring Action</h2>
                  <Link
                    href={`/${tenantSlug}/view/${scope}/updates`}
                    className="text-xs text-primary hover:underline"
                  >
                    View all
                  </Link>
                </div>
                {updateMetrics.requiringAction.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending updates right now.</p>
                ) : (
                  <div className="space-y-2">
                    {updateMetrics.requiringAction.slice(0, 8).map((row) => (
                      <Link
                        key={row.recipient.id}
                        href={`/${tenantSlug}/view/${scope}/updates/${row.update.id}`}
                        className="block rounded-md border border-border p-3 hover:bg-muted/20"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">{row.update.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.brand.name || row.brand.slug || "Brand"} | urgency {row.update.urgency}
                            </p>
                          </div>
                          <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs text-foreground">
                            {row.recipient.status}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>Due: {formatDate(resolveDueAt(row))}</span>
                          <span>Published: {formatDate(row.update.publishedAt)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-white p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">New Assets Shared</h3>
                  {assetEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recent assets.</p>
                  ) : (
                    <div className="space-y-2">
                      {assetEvents.map((event) => (
                        <Link key={event.id} href={event.href} className="block rounded-md border border-border p-2 hover:bg-muted/20">
                          <p className="text-sm font-medium text-foreground">{event.title}</p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{event.description}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {event.organizationName} | {formatRelative(event.createdAt)}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-white p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">New Products Shared</h3>
                  {productEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recent products.</p>
                  ) : (
                    <div className="space-y-2">
                      {productEvents.map((event) => (
                        <Link key={event.id} href={event.href} className="block rounded-md border border-border p-2 hover:bg-muted/20">
                          <p className="text-sm font-medium text-foreground">{event.title}</p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{event.description}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {event.organizationName} | {formatRelative(event.createdAt)}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
      )}
    </PageContentContainer>
  );
}
