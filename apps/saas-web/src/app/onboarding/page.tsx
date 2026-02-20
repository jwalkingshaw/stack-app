import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@tradetool/database";
import OnboardingClient from "./OnboardingClient";
import { AuthLayoutShell } from "@tradetool/ui";
import { getCurrentOrganization, requireUser } from "@/lib/auth-server";
import { getActiveWorkspaceMemberships } from "@/lib/workspace-notifications";

type OnboardingSearchParams = Record<string, string | string[] | undefined>;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<OnboardingSearchParams>;
}) {
  const user = await requireUser();
  if (!user?.id) {
    redirect("/login");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const typeParam = resolvedSearchParams.type;
  const tokenParam = resolvedSearchParams.token;
  const brandIdParam = resolvedSearchParams.brand_id;
  const onboardingType = Array.isArray(typeParam) ? typeParam[0] : typeParam;
  const onboardingToken = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const onboardingBrandId = Array.isArray(brandIdParam) ? brandIdParam[0] : brandIdParam;
  const hasPartnerInviteContext =
    typeof onboardingToken === "string" &&
    onboardingToken.trim().length > 0 &&
    typeof onboardingBrandId === "string" &&
    onboardingBrandId.trim().length > 0;
  const isPartnerInviteOnboarding =
    (onboardingType === "partner" || hasPartnerInviteContext) &&
    typeof onboardingToken === "string" &&
    onboardingToken.trim().length > 0;

  if (!isPartnerInviteOnboarding) {
    const supabase = createServerClient();
    const memberships = await getActiveWorkspaceMemberships(
      supabase,
      user.id,
      user.email
    );
    if (memberships.length > 0) {
      redirect("/");
    }

    const currentOrganization = await getCurrentOrganization();
    if (currentOrganization?.slug) {
      redirect(`/${currentOrganization.slug}`);
    }
  }

  return (
    <Suspense
      fallback={
        <AuthLayoutShell
          authContext={{ isAuthenticated: false }}
          headerProps={{ className: "hidden" }}
          contentClassName="pt-0"
        >
          <div className="flex min-h-screen items-center justify-center px-4 py-12">
            <div className="rounded-2xl border border-muted/30 bg-white px-6 py-8 text-sm text-muted-foreground shadow-sm sm:px-8">
              Loading...
            </div>
          </div>
        </AuthLayoutShell>
      }
    >
      <OnboardingClient />
    </Suspense>
  );
}
