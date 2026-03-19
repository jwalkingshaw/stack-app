import { redirect } from 'next/navigation';
import { createServerClient, DatabaseQueries } from '@tradetool/database';
import { getOrganizationBillingLimits } from '@/lib/billing-policy';

interface LocalizationLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}

export default async function LocalizationLayout({ children, params }: LocalizationLayoutProps) {
  const { tenant } = await params;

  const supabase = createServerClient();
  const db = new DatabaseQueries(supabase);
  const organization = await db.getOrganizationBySlug(tenant);

  if (organization) {
    const { planId } = await getOrganizationBillingLimits(organization.id).catch(() => ({ planId: 'starter' }));
    if (planId === 'starter') {
      redirect(`/${tenant}/settings`);
    }
  }

  return <>{children}</>;
}
