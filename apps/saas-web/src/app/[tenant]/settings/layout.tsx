import { Suspense } from 'react';
import { getSafeUserData } from '@/lib/auth-server';
import { PageHeader } from '@/components/ui/page-header';
import SettingsNavigation from './components/SettingsNavigation';
import { PageLoader } from '@/components/ui/loading-spinner';
import { createServerClient, DatabaseQueries } from '@tradetool/database';

interface SettingsLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}

export default async function SettingsLayout({ children, params }: SettingsLayoutProps) {
  const { tenant } = await params;

  // Get user and organization data for consistent styling
  const [userData, organization] = await Promise.all([
    getSafeUserData(),
    (async () => {
      const supabase = createServerClient();
      const db = new DatabaseQueries(supabase);
      return db.getOrganizationBySlug(tenant);
    })(),
  ]);

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
        type: (organization.organizationType || organization.type || "brand") as "brand" | "partner",
        partnerCategory: organization.partnerCategory ?? null,
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
          />
        </div>

        {/* Content area with grey border frame - matches AppLayoutShell styling */}
        <div className="flex-1 min-w-0 p-2 h-screen bg-[#f5f5f5]">
          <div className="h-full w-full bg-background rounded border border-muted/20 shadow-soft overflow-hidden">
            <div className="h-full overflow-y-auto bg-white">
              <div className="w-full">
                <PageHeader title="Settings" />
                <main className="p-6">
                  <Suspense fallback={
                    <PageLoader text="Loading..." size="lg" />
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
