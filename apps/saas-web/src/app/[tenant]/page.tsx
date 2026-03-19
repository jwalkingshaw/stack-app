import DashboardClient from "./DashboardClient";
import { createServerClient, DatabaseQueries } from "@tradetool/database";
import { redirect } from "next/navigation";

interface TenantDashboardProps {
  params: Promise<{ tenant: string }>
}

export default async function TenantDashboard({ params }: TenantDashboardProps) {
  const resolvedParams = await params
  const tenantSlug = resolvedParams.tenant

  const supabase = createServerClient();
  const db = new DatabaseQueries(supabase);
  const organization = await db.getOrganizationBySlug(tenantSlug);
  const organizationType = String(
    organization?.organizationType || organization?.type || "brand"
  ).toLowerCase();

  if (organizationType === "partner") {
    redirect(`/${tenantSlug}/view/all`);
  }

  return (
    <DashboardClient tenantSlug={tenantSlug} />
  );
}
