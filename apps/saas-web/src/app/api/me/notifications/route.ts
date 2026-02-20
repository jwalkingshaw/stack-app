import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@tradetool/database";
import { getCurrentOrganization, requireUser } from "@/lib/auth-server";
import {
  getActiveWorkspaceMemberships,
  getWorkspaceNotificationEvents,
  getWorkspaceNotificationStateMap,
  getWorkspaceUnreadCounts,
  markWorkspaceNotificationsRead,
} from "@/lib/workspace-notifications";

function parseLimit(input: string | null): number {
  const parsed = Number.parseInt(input || "60", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 60;
  return Math.min(parsed, 200);
}

function isNotificationStateMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  const maybeMessage = String((error as { message?: string }).message || "");
  return (
    maybeCode === "42P01" ||
    maybeCode === "PGRST205" ||
    maybeMessage.includes("user_workspace_notification_state") ||
    maybeMessage.includes("schema cache")
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createServerClient();
    const memberships = await getActiveWorkspaceMemberships(
      supabase,
      user.id,
      user.email,
      { includeEmailLookup: false }
    );

    if (memberships.length === 0) {
      const currentOrganization = await getCurrentOrganization();
      if (currentOrganization?.slug) {
        return NextResponse.json({
          notifications: [],
          workspaces: [
            {
              id: currentOrganization.id,
              slug: currentOrganization.slug,
              name: currentOrganization.name,
              role: "member",
              organizationType: (currentOrganization.organizationType ||
                currentOrganization.type ||
                "brand") as "brand" | "partner",
              partnerCategory: currentOrganization.partnerCategory ?? null,
              lastAccessed: undefined,
              unreadCount: 0,
            },
          ],
          workspaceSlug: null,
        });
      }

      return NextResponse.json({
        notifications: [],
        workspaces: [],
      });
    }

    const url = new URL(request.url);
    const workspaceSlug = url.searchParams.get("workspaceSlug") || undefined;
    const limit = parseLimit(url.searchParams.get("limit"));
    const compact = url.searchParams.get("compact") === "1";
    const organizationIds = memberships.map((membership) => membership.organization.id);
    const states = await getWorkspaceNotificationStateMap(supabase, user.id, organizationIds);

    if (
      workspaceSlug &&
      !memberships.some((membership) => membership.organization.slug === workspaceSlug)
    ) {
      return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
    }

    if (compact) {
      const notifications = await getWorkspaceNotificationEvents(
        supabase,
        memberships,
        states,
        limit,
        workspaceSlug
      );

      return NextResponse.json({
        notifications,
        workspaces: [],
        workspaceSlug: workspaceSlug ?? null,
      });
    }

    const [notifications, unreadByWorkspace] = await Promise.all([
      getWorkspaceNotificationEvents(supabase, memberships, states, limit, workspaceSlug),
      getWorkspaceUnreadCounts(supabase, memberships, states),
    ]);

    const workspaces = memberships.map((membership) => ({
      id: membership.organization.id,
      slug: membership.organization.slug,
      name: membership.organization.name,
      role: membership.role,
      organizationType: membership.organization.organizationType,
      partnerCategory: membership.organization.partnerCategory,
      lastAccessed: membership.lastAccessedAt ?? undefined,
      unreadCount: unreadByWorkspace.get(membership.organization.id) ?? 0,
    }));

    return NextResponse.json({
      notifications,
      workspaces,
      workspaceSlug: workspaceSlug ?? null,
    });
  } catch (error) {
    if (isNotificationStateMissingError(error)) {
      return NextResponse.json({
        notifications: [],
        workspaces: [],
        workspaceSlug: null,
      });
    }
    console.error("Error in GET /api/me/notifications:", error);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const workspaceSlug =
      typeof body.workspaceSlug === "string" && body.workspaceSlug.length > 0
        ? body.workspaceSlug
        : null;

    const supabase = createServerClient();
    const memberships = await getActiveWorkspaceMemberships(
      supabase,
      user.id,
      user.email,
      { includeEmailLookup: false }
    );

    if (memberships.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const targetOrganizationIds = workspaceSlug
      ? memberships
          .filter((membership) => membership.organization.slug === workspaceSlug)
          .map((membership) => membership.organization.id)
      : memberships.map((membership) => membership.organization.id);

    if (workspaceSlug && targetOrganizationIds.length === 0) {
      return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
    }

    await markWorkspaceNotificationsRead(supabase, user.id, targetOrganizationIds);

    return NextResponse.json({
      success: true,
      updated: targetOrganizationIds.length,
    });
  } catch (error) {
    const maybeCode = (error as { code?: string } | null)?.code;
    if (maybeCode === "42P01") {
      return NextResponse.json(
        { error: "notification_state_not_configured" },
        { status: 503 }
      );
    }
    console.error("Error in POST /api/me/notifications:", error);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
