"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useWorkspaces, WorkspaceSummary } from "@/hooks/useWorkspaces";
import { SaaSSidebar } from "@/components/SaaSSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AllBrandsClientProps {
  userName: string;
  userEmail?: string;
  currentPath?: string;
  pageTitle?: string;
  standaloneLayout?: boolean;
  initialWorkspaces?: WorkspaceSummary[];
  sidebarOrganization?: {
    id: string;
    name: string;
    slug: string;
    organizationType: "brand" | "partner";
    partnerCategory: "retailer" | "distributor" | "wholesaler" | null;
    storageUsed: number;
    storageLimit: number;
  };
}

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

export default function AllBrandsClient({
  userName,
  userEmail,
  currentPath = "/home",
  pageTitle = "Home",
  standaloneLayout = true,
  initialWorkspaces,
  sidebarOrganization,
}: AllBrandsClientProps) {
  const searchParams = useSearchParams();
  const selectedBrandSlug = (searchParams.get("brand") || "").trim().toLowerCase();
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState<NotificationItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { sortedWorkspaces, refresh: refreshWorkspaces } = useWorkspaces({
    initialWorkspaces,
  });

  const filteredWorkspaces = useMemo(() => {
    const brandScoped = sortedWorkspaces.filter(
      (workspace) => workspace.organizationType === "brand"
    );
    const baseList = brandScoped.length > 0 ? brandScoped : sortedWorkspaces;
    const filteredByBrand =
      selectedBrandSlug.length > 0
        ? baseList.filter((workspace) => workspace.slug.toLowerCase() === selectedBrandSlug)
        : baseList;
    const searchTerm = search.trim().toLowerCase();
    if (!searchTerm) return filteredByBrand;
    return filteredByBrand.filter((workspace) =>
      `${workspace.name} ${workspace.slug}`.toLowerCase().includes(searchTerm)
    );
  }, [search, selectedBrandSlug, sortedWorkspaces]);

  const loadEvents = async () => {
    setLoadingEvents(true);
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 3500);
      const response = await fetch("/api/me/notifications?limit=30&compact=1", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        setEvents([]);
        return;
      }
      const payload = await response.json();
      setEvents(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch {
      setEvents([]);
    } finally {
      if (timeout) clearTimeout(timeout);
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshWorkspaces(), loadEvents()]);
    } finally {
      setRefreshing(false);
    }
  };

  const overviewContent = (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Workspace Overview
          </p>
          <h1 className="text-2xl font-semibold text-foreground mt-1">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signed in as {userName}. Select a brand to focus your DAM/PIM workspace.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Shared brand content is available inside your partner workspace only.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="mt-6">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter brands..."
          className="max-w-sm"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredWorkspaces.map((workspace) => (
          <div key={workspace.id} className="rounded-xl border border-border/70 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{workspace.name}</h2>
                <p className="text-xs text-muted-foreground">/{workspace.slug}</p>
              </div>
              {workspace.unreadCount && workspace.unreadCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white">
                  {workspace.unreadCount > 99 ? "99+" : workspace.unreadCount}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {workspace.organizationType === "brand" ? "Shared brand" : "Workspace"}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Shared content from this brand appears inside your partner workspace.
            </p>
            {workspace.organizationType === "brand" &&
            sidebarOrganization?.organizationType === "partner" ? (
              <Link
                href={`/${sidebarOrganization.slug}/view/${workspace.slug}/products`}
                prefetch={false}
                className="mt-4 inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
              >
                Open workspace
              </Link>
            ) : (
              <Link
                href={`/${workspace.slug}`}
                prefetch={false}
                className="mt-4 inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
              >
                Open workspace
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Recent cross-brand activity</h3>
          <Link href="/notifications" prefetch={false} className="text-sm text-primary hover:underline">
            Open notification center
          </Link>
        </div>

        <div className="mt-4 space-y-2">
          {loadingEvents ? (
            <p className="text-sm text-muted-foreground">Loading activity...</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity found.</p>
          ) : (
            events.map((event) => (
              <Link
                key={event.id}
                href={event.href}
                prefetch={false}
                className={`block rounded-lg border p-3 transition-colors ${
                  event.isRead ? "border-border/60 bg-white" : "border-primary/30 bg-primary/5"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.organizationName} | {formatRelativeTime(event.createdAt)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );

  if (!standaloneLayout) {
    return <div className="h-full overflow-y-auto bg-white p-6 md:p-8">{overviewContent}</div>;
  }

  return (
    <div className="min-h-screen bg-sidebar">
      <div className="flex h-screen max-w-full">
        <div className="sticky top-0 h-screen flex-shrink-0 bg-[#f5f5f5]">
          <SaaSSidebar
            organization={
              sidebarOrganization
                ? {
                    id: sidebarOrganization.id,
                    name: sidebarOrganization.name,
                    slug: sidebarOrganization.slug,
                    organizationType: sidebarOrganization.organizationType,
                    partnerCategory: sidebarOrganization.partnerCategory,
                  }
                : null
            }
            orgSlug={sidebarOrganization?.slug}
            currentPath={currentPath}
            workspaces={sortedWorkspaces}
            storageUsed={sidebarOrganization?.storageUsed ?? 0}
            storageLimit={sidebarOrganization?.storageLimit ?? 0}
            user={
              userEmail
                ? {
                    id: "",
                    email: userEmail,
                    firstName: userName,
                  }
                : null
            }
            onLogout={() => {
              window.location.href = "/api/auth/logout";
            }}
          />
        </div>

        <div className="h-screen min-w-0 flex-1 bg-[#f5f5f5] p-2">
          <div className="h-full w-full overflow-hidden rounded border border-muted/20 bg-background shadow-soft">
            <div className="h-full overflow-y-auto bg-white p-6 md:p-8">{overviewContent}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
