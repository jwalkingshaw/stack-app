import { NextResponse } from "next/server";
import { getCurrentOrganization, requireUser } from "@/lib/auth-server";
import { createServerClient } from "@tradetool/database";
import {
  getActiveWorkspaceMemberships,
  getWorkspaceNotificationStateMap,
  getWorkspaceUnreadCounts,
} from "@/lib/workspace-notifications";

// GET /api/me/workspaces
// Returns all workspaces the authenticated user can access (direct membership + partner brand access).
export async function GET() {
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
        const fallbackWorkspace = {
          id: currentOrganization.id,
          name: currentOrganization.name,
          slug: currentOrganization.slug,
          role: "member",
          organizationType: (currentOrganization.organizationType ||
            currentOrganization.type ||
            "brand") as "brand" | "partner",
          partnerCategory: currentOrganization.partnerCategory ?? null,
          storageUsed: currentOrganization.storageUsed,
          storageLimit: currentOrganization.storageLimit,
          lastAccessed: undefined,
          joinedAt: undefined,
          unreadCount: 0,
        };

        return NextResponse.json({
          user: {
            id: user.id,
            email: user.email,
          },
          workspaces: [fallbackWorkspace],
          lastUsedWorkspace: fallbackWorkspace,
        });
      }

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
        },
        workspaces: [],
        lastUsedWorkspace: null,
      });
    }

    const organizationIds = memberships.map((membership) => membership.organization.id);
    const stateByWorkspace = await getWorkspaceNotificationStateMap(
      supabase,
      user.id,
      organizationIds
    );
    const unreadByWorkspace = await getWorkspaceUnreadCounts(
      supabase,
      memberships,
      stateByWorkspace
    );

    const workspaces = memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      organizationType: membership.organization.organizationType,
      partnerCategory: membership.organization.partnerCategory,
      storageUsed: membership.organization.storageUsed,
      storageLimit: membership.organization.storageLimit,
      lastAccessed: membership.lastAccessedAt ?? undefined,
      joinedAt: membership.createdAt ?? undefined,
      unreadCount: unreadByWorkspace.get(membership.organization.id) ?? 0,
    }));

    const lastUsedWorkspace =
      workspaces
        .filter((workspace) => workspace.lastAccessed)
        .sort(
          (a, b) =>
            new Date(b.lastAccessed as string).getTime() -
            new Date(a.lastAccessed as string).getTime()
        )[0] || workspaces[0];

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        given_name: user.given_name,
        family_name: user.family_name,
        picture: user.picture,
        name:
          user.given_name && user.family_name
            ? `${user.given_name} ${user.family_name}`
            : user.email,
      },
      workspaces,
      lastUsedWorkspace,
    });
    response.headers.set("Cache-Control", "private, max-age=30, s-maxage=30");
    return response;
  } catch (error) {
    console.error("Error in /api/me/workspaces:", error);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
