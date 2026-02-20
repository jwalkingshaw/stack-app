"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WorkspaceRail } from "@/components/WorkspaceRail";
import { Button } from "@/components/ui/button";
import { useWorkspaces } from "@/hooks/useWorkspaces";

interface NotificationItem {
  id: string;
  type: "asset_added" | "product_added" | "share_granted";
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  title: string;
  description: string;
  createdAt: string;
  isRead: boolean;
  href: string;
}

function formatRelativeTime(input: string): string {
  const date = new Date(input);
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsClient() {
  const [workspaceSlugFilter, setWorkspaceSlugFilter] = useState<string>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingRead, setMarkingRead] = useState(false);
  const { sortedWorkspaces, refresh: refreshWorkspaces } = useWorkspaces();

  const queryString = useMemo(() => {
    if (workspaceSlugFilter === "all") return "?limit=100";
    return `?limit=100&workspaceSlug=${encodeURIComponent(workspaceSlugFilter)}`;
  }, [workspaceSlugFilter]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/me/notifications${queryString}`, { cache: "no-store" });
      if (!response.ok) {
        setItems([]);
        return;
      }
      const payload = await response.json();
      setItems(Array.isArray(payload.notifications) ? payload.notifications : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [queryString]);

  const unreadCount = useMemo(
    () => items.reduce((count, item) => count + (item.isRead ? 0 : 1), 0),
    [items]
  );

  const onMarkRead = async () => {
    setMarkingRead(true);
    try {
      const body =
        workspaceSlugFilter === "all"
          ? {}
          : {
              workspaceSlug: workspaceSlugFilter,
            };
      await fetch("/api/me/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await Promise.all([fetchNotifications(), refreshWorkspaces()]);
    } finally {
      setMarkingRead(false);
    }
  };

  return (
    <div className="min-h-screen bg-sidebar">
      <div className="flex h-screen max-w-full">
        <div className="sticky top-0 h-screen flex-shrink-0 bg-[#f5f5f5]">
          <WorkspaceRail currentWorkspaceSlug="" currentPath="/notifications" />
        </div>

        <div className="flex-1 min-w-0 p-2 h-screen bg-[#f5f5f5]">
          <div className="h-full w-full bg-background rounded border border-muted/20 shadow-soft overflow-hidden">
            <div className="h-full overflow-y-auto bg-white p-6 md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-foreground">Notification Center</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    New assets, products, and share grants across your brands.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={workspaceSlugFilter}
                    onChange={(event) => setWorkspaceSlugFilter(event.target.value)}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  >
                    <option value="all">All brands</option>
                    {sortedWorkspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.slug}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onMarkRead}
                    disabled={markingRead || unreadCount === 0}
                  >
                    Mark read
                  </Button>
                </div>
              </div>

              <div className="mt-4 text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </div>

              <div className="mt-6 space-y-2">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading notifications...</p>
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notifications available.</p>
                ) : (
                  items.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`block rounded-lg border p-3 transition-colors ${
                        item.isRead ? "border-border/60 bg-white" : "border-primary/30 bg-primary/5"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.organizationName} · {formatRelativeTime(item.createdAt)}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
