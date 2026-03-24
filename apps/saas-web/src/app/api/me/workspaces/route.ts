import { NextResponse } from "next/server";
import { getCurrentOrganization, requireUser } from "@/lib/auth-server";
import { cache as redisCache, CacheKeys, CacheTTL } from "@/lib/redis";
import { createServerClient } from "@tradetool/database";
import {
  getActiveWorkspaceMemberships,
  getWorkspaceNotificationStateMap,
  getWorkspaceUnreadCounts,
} from "@/lib/workspace-notifications";

type MeWorkspacesPayload = {
  user: {
    id: string;
    email: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
    name?: string | null;
  };
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
    organizationType: "brand" | "partner";
    partnerCategory: string | null;
    logoUrl: string | null;
    storageUsed: number;
    storageLimit: number;
    lastAccessed?: string;
    joinedAt?: string;
    unreadCount: number;
  }>;
  lastUsedWorkspace: {
    id: string;
    name: string;
    slug: string;
    role: string;
    organizationType: "brand" | "partner";
    partnerCategory: string | null;
    logoUrl: string | null;
    storageUsed: number;
    storageLimit: number;
    lastAccessed?: string;
    joinedAt?: string;
    unreadCount: number;
  } | null;
};

// GET /api/me/workspaces
// Returns all workspaces the authenticated user can access (direct membership + partner brand access).
export async function GET() {
  try {
    const user = await requireUser();

    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const cacheKey = CacheKeys.userWorkspaces(user.id);
    const cached = await redisCache.get<MeWorkspacesPayload>(cacheKey);
    if (cached) {
      const response = NextResponse.json(cached);
      response.headers.set("Cache-Control", "private, max-age=20, s-maxage=20");
      return response;
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
          logoUrl: currentOrganization.logoUrl ?? null,
          storageUsed: currentOrganization.storageUsed,
          storageLimit: currentOrganization.storageLimit,
          lastAccessed: undefined,
          joinedAt: undefined,
          unreadCount: 0,
        };

        const fallbackPayload: MeWorkspacesPayload = {
          user: {
            id: user.id,
            email: user.email,
          },
          workspaces: [fallbackWorkspace],
          lastUsedWorkspace: fallbackWorkspace,
        };
        await redisCache.set(cacheKey, fallbackPayload, CacheTTL.WORKSPACES);

        const response = NextResponse.json(fallbackPayload);
        response.headers.set("Cache-Control", "private, max-age=20, s-maxage=20");
        return response;
      }

      const noWorkspacePayload: MeWorkspacesPayload = {
        user: {
          id: user.id,
          email: user.email,
        },
        workspaces: [],
        lastUsedWorkspace: null,
      };
      await redisCache.set(cacheKey, noWorkspacePayload, CacheTTL.WORKSPACES);
      const response = NextResponse.json(noWorkspacePayload);
      response.headers.set("Cache-Control", "private, max-age=20, s-maxage=20");
      return response;
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
      logoUrl: membership.organization.logoUrl ?? null,
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

    const payload: MeWorkspacesPayload = {
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
    };

    await redisCache.set(cacheKey, payload, CacheTTL.WORKSPACES);

    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "private, max-age=20, s-maxage=20");
    return response;
  } catch (error) {
    console.error("Error in /api/me/workspaces:", error);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
