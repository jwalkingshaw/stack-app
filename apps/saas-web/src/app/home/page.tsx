import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-server";
import { createServerClient } from "@tradetool/database";
import { getActiveWorkspaceMemberships } from "@/lib/workspace-notifications";
import AllBrandsClient from "../all-brands/AllBrandsClient";

export default async function HomePage() {
  const user = await requireUser();

  if (!user?.id) {
    redirect("/login");
  }

  const supabase = createServerClient();
  let memberships: Awaited<ReturnType<typeof getActiveWorkspaceMemberships>> = [];
  try {
    memberships = await getActiveWorkspaceMemberships(
      supabase,
      user.id,
      user.email,
      { includeEmailLookup: false }
    );
  } catch (error) {
    console.error("Failed to preload home workspaces:", error);
  }
  const initialWorkspaces = memberships.map((membership) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    role: membership.role,
    organizationType: membership.organization.organizationType,
    partnerCategory: membership.organization.partnerCategory,
    lastAccessed: membership.lastAccessedAt || undefined,
    unreadCount: 0,
  }));

  const partnerMembership = memberships.find(
    (membership) => membership.organization.organizationType === "partner"
  );

  // Canonical partner overview route.
  if (partnerMembership?.organization?.slug) {
    redirect(`/${partnerMembership.organization.slug}/view/all`);
  }

  const mostRecentMembership =
    memberships
      .filter((membership) => membership.lastAccessedAt)
      .sort(
        (a, b) =>
          new Date(b.lastAccessedAt as string).getTime() -
          new Date(a.lastAccessedAt as string).getTime()
      )[0] || memberships[0];
  const sidebarMembership = partnerMembership || mostRecentMembership;

  return (
    <AllBrandsClient
      userName={
        user.given_name && user.family_name
          ? `${user.given_name} ${user.family_name}`
          : user.email || "User"
      }
      userEmail={user.email || undefined}
      currentPath="/home"
      pageTitle="Home"
      initialWorkspaces={initialWorkspaces}
      sidebarOrganization={
        sidebarMembership
          ? {
              id: sidebarMembership.organization.id,
              name: sidebarMembership.organization.name,
              slug: sidebarMembership.organization.slug,
              organizationType: sidebarMembership.organization.organizationType,
              partnerCategory: sidebarMembership.organization.partnerCategory,
              storageUsed: sidebarMembership.organization.storageUsed,
              storageLimit: sidebarMembership.organization.storageLimit,
            }
          : undefined
      }
    />
  );
}
