"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { Skeleton } from "@/components/ui/skeleton";

type SummaryPayload = {
  totals: {
    updates: number;
    published: number;
    draft: number;
    updatesWithKit: number;
    kitItems: number;
    recipients: number;
    opened: number;
    acknowledged: number;
    activated: number;
    overdueRecipients: number;
    openRate: number;
  };
  recent: Array<{
    id: string;
    title: string;
    status: string;
    urgency: string;
    dueAt: string | null;
    publishedAt: string | null;
    updatedAt: string;
    recipientCount: number;
    openCount: number;
    acknowledgeCount: number;
    openRate: number;
    hasKit: boolean;
  }>;
};

type NotificationEvent = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  href: string;
  isRead: boolean;
};

interface DashboardClientProps {
  tenantSlug: string;
}

function formatDate(input: string | null): string {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function DashboardClient({ tenantSlug }: DashboardClientProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [events, setEvents] = useState<NotificationEvent[]>([]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [summaryRes, eventsRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/updates/summary`, { cache: "no-store" }),
        fetch(`/api/me/notifications?workspaceSlug=${encodeURIComponent(tenantSlug)}&compact=1&limit=24`, {
          cache: "no-store",
        }),
      ]);

      if (summaryRes.ok) {
        const summaryPayload = await summaryRes.json().catch(() => ({}));
        setSummary(summaryPayload?.data || null);
      } else {
        setSummary(null);
      }

      if (eventsRes.ok) {
        const eventsPayload = await eventsRes.json().catch(() => ({}));
        const rows = Array.isArray(eventsPayload?.notifications)
          ? eventsPayload.notifications
          : [];
        setEvents(rows);
      } else {
        setEvents([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const latestEvents = useMemo(() => events.slice(0, 8), [events]);

  return (
    <main className="w-full min-h-full">
      <PageHeader
        title="Dashboard"
        actions={[
          {
            label: "Refresh",
            icon: ({ className }) => <RefreshCw className={`${className ?? ""} ${refreshing ? "animate-spin" : ""}`} />,
            variant: "outline",
            onClick: async () => {
              setRefreshing(true);
              try {
                await fetchData(true);
              } finally {
                setRefreshing(false);
              }
            },
            disabled: refreshing,
          },
        ]}
      />
      <PageContentContainer mode="form" padding="page" className="space-y-4">

        {loading ? (
          <div className="space-y-4">
            {/* Stat cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-white p-4 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
            {/* Table + activity */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-lg border border-border bg-white p-4 xl:col-span-2 space-y-3">
                <Skeleton className="h-4 w-32" />
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-white p-4 space-y-3">
                <Skeleton className="h-4 w-28" />
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted-foreground">Updates</p>
                <p className="text-2xl font-semibold text-foreground">
                  {summary?.totals.updates ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary?.totals.published ?? 0} published | {summary?.totals.draft ?? 0} draft
                </p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted-foreground">Updates With Kit</p>
                <p className="text-2xl font-semibold text-foreground">
                  {summary?.totals.updatesWithKit ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary?.totals.kitItems ?? 0} total kit items referenced
                </p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted-foreground">Message Opens</p>
                <p className="text-2xl font-semibold text-foreground">
                  {Math.round((summary?.totals.openRate ?? 0) * 100)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary?.totals.opened ?? 0} of {summary?.totals.recipients ?? 0} recipients
                </p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted-foreground">Acknowledged</p>
                <p className="text-2xl font-semibold text-foreground">
                  {summary?.totals.acknowledged ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary?.totals.activated ?? 0} activated
                </p>
              </div>
              <div className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted-foreground">Overdue Recipients</p>
                <p className="text-2xl font-semibold text-foreground">
                  {summary?.totals.overdueRecipients ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">need follow-up</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-lg border border-border bg-white p-4 xl:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Recent Updates</h2>
                  <Link href={`/${tenantSlug}/updates`} className="text-xs text-primary hover:underline">
                    Open module
                  </Link>
                </div>
                {summary?.recent?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-muted/50">
                        <tr className="border-b border-border">
                          <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Title</th>
                          <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                          <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Kit</th>
                          <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Recipients</th>
                          <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Open Rate</th>
                          <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.recent.map((update) => (
                          <tr key={update.id} className="border-b border-border/60">
                            <td className="px-2 py-2">
                              <Link
                                href={`/${tenantSlug}/updates/${update.id}`}
                                className="font-medium text-foreground hover:underline"
                              >
                                {update.title}
                              </Link>
                            </td>
                            <td className="px-2 py-2">{update.status}</td>
                            <td className="px-2 py-2">{update.hasKit ? "Yes" : "No"}</td>
                            <td className="px-2 py-2">{update.recipientCount}</td>
                            <td className="px-2 py-2">{Math.round(update.openRate * 100)}%</td>
                            <td className="px-2 py-2">{formatDate(update.dueAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No updates created yet.</p>
                )}
              </div>

              <div className="rounded-lg border border-border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
                  <Link href="/notifications" className="text-xs text-primary hover:underline">
                    Open notifications
                  </Link>
                </div>
                <div className="space-y-2">
                  {latestEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recent activity.</p>
                  ) : (
                    latestEvents.map((event) => (
                      <Link
                        key={event.id}
                        href={event.href}
                        className={`block rounded-md border p-2 text-sm ${
                          event.isRead ? "border-border bg-white" : "border-primary/40 bg-primary/5"
                        }`}
                      >
                        <p className="font-medium text-foreground">{event.title}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {event.description}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </PageContentContainer>
    </main>
  );
}
