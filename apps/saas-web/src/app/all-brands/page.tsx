import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-server";
import { createServerClient } from "@tradetool/database";
import { getActiveWorkspaceMemberships } from "@/lib/workspace-notifications";

export default async function AllBrandsPage() {
  const user = await requireUser();
  if (!user?.id) {
    redirect("/login");
  }

  try {
    const supabase = createServerClient();
    const memberships = await getActiveWorkspaceMemberships(
      supabase,
      user.id,
      user.email,
      { includeEmailLookup: false }
    );
    const partnerMembership = memberships.find(
      (membership) => membership.organization.organizationType === "partner"
    );
    if (partnerMembership?.organization?.slug) {
      redirect(`/${partnerMembership.organization.slug}/view/all`);
    }
  } catch (error) {
    console.error("Failed resolving /all-brands redirect:", error);
  }

  redirect("/home");
}
