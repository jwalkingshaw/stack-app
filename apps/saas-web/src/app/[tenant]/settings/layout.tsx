import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSafeUserData } from '@/lib/auth-server';
import SettingsNavigation from './components/SettingsNavigation';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { createServerClient, DatabaseQueries } from '@tradetool/database';
import { getOrganizationBillingLimits } from '@/lib/billing-policy';
import {
  buildPartnerSettingsRedirectPath,
  isPartnerSettingsPathAllowed,
} from '@/lib/partner-settings-access';

interface SettingsLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}

export default async function SettingsLayout({ children, params }: SettingsLayoutProps) {
  const { tenant } = await params;

  // Get user and organization data for consistent styling
  const [userData, organization, requestHeaders] = await Promise.all([
    getSafeUserData(),
    (async () => {
      const supabase = createServerClient();
      const db = new DatabaseQueries(supabase);
      return db.getOrganizationBySlug(tenant);
    })(),
    headers(),
  ]);

  const organizationType = (organization?.organizationType ||
    organization?.type ||
    "brand") as "brand" | "partner";
  const requestPathname =
    requestHeaders.get("x-request-pathname") ?? `/${tenant}/settings`;
  if (
    organizationType === "partner" &&
    !isPartnerSettingsPathAllowed(requestPathname, tenant)
  ) {
    redirect(buildPartnerSettingsRedirectPath(tenant));
  }

  const planId = organization
    ? await getOrganizationBillingLimits(organization.id).then((r) => r.planId).catch(() => 'starter')
    : 'starter';

  // userData already has the correct type structure from getSafeUserData
  const safeUserData = userData as {
    id: string;
    email: string;
    given_name: string | null;
    family_name: string | null;
    picture: string | null;
  } | null;
  const safeOrganizationData = organization
    ? {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        type: organizationType,
        partnerCategory: organization.partnerCategory ?? null,
        logoUrl: organization.logoUrl ?? null,
        storageUsed: organization.storageUsed,
        storageLimit: organization.storageLimit,
      }
    : null;

  return (
    <div className="min-h-screen bg-sidebar overflow-hidden">
      <div className="flex h-screen max-w-full">
        {/* Settings Sidebar - replaces SAAS sidebar */}
        <div className="sticky top-0 h-screen flex-shrink-0">
          <SettingsNavigation
            tenantSlug={tenant}
            organization={safeOrganizationData}
            user={safeUserData}
            planId={planId}
          />
        </div>

        {/* Content area with grey border frame - matches AppLayoutShell styling */}
        <div className="flex-1 min-w-0 p-3 h-screen bg-[#f5f5f5]">
          <div className="h-full w-full bg-background rounded shadow-soft overflow-hidden">
            <div className="relative h-full overflow-y-auto bg-white isolate">
              <div className="w-full">
                <main className="min-h-full">
                  <Suspense fallback={
                    <PageSkeleton text="Loading..." size="lg" />
                  }>
                    {children}
                  </Suspense>
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

