import DashboardClient from "./DashboardClient";

interface TenantDashboardProps {
  params: Promise<{ tenant: string }>
}

export default async function TenantDashboard({ params }: TenantDashboardProps) {
  const resolvedParams = await params
  const tenantSlug = resolvedParams.tenant

  // Server component - no loading states needed
  // Auth and organization data is already available from layout
  return (
    <DashboardClient tenantSlug={tenantSlug} />
  );
}