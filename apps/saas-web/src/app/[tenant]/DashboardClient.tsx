"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageContentContainer } from "@/components/ui/page-content-container";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function DashboardClient({ tenantSlug }: DashboardClientProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<NotificationEvent[]>([]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const eventsRes = await fetch(
        `/api/me/notifications?workspaceSlug=${encodeURIComponent(tenantSlug)}&compact=1&limit=24`,
        { cache: "no-store" }
      );

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
            icon: ({ className }) =>
              refreshing ? (
                <span className={className}>
                  <LoadingSkeleton size="sm" />
                </span>
              ) : (
                <RefreshCw className={className} />
              ),
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
          <div className="rounded-lg border border-border bg-white p-4 space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-80" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-white p-4">
              <h2 className="text-sm font-semibold text-foreground">Launch Focus</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Focus this workspace on products, assets, outputs, and partner delivery. Updates
                and kits remain available internally by direct route, but they are hidden from the
                main launch experience.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/${tenantSlug}/products`}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/30"
                >
                  Open products
                </Link>
                <Link
                  href={`/${tenantSlug}/assets`}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted/30"
                >
                  Open assets
                </Link>
              </div>
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
        )}
      </PageContentContainer>
    </main>
  );
}
