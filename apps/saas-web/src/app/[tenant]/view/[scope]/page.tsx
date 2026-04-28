import { redirect } from "next/navigation";
import { PartnerHomeClient } from "./PartnerHomeClient";

interface ScopedTenantHomePageProps {
  params: Promise<{ tenant: string; scope: string }>;
}

export default async function ScopedTenantHomePage({ params }: ScopedTenantHomePageProps) {
  const resolvedParams = await params;
  const tenantSlug = resolvedParams.tenant;
  const normalizedScope = (resolvedParams.scope || "").trim().toLowerCase();

  if (
    !normalizedScope ||
    normalizedScope === "self" ||
    normalizedScope === tenantSlug.trim().toLowerCase()
  ) {
    redirect(`/${tenantSlug}`);
  }

  return (
    <PartnerHomeClient tenantSlug={tenantSlug} scope={resolvedParams.scope} />
  );
}
