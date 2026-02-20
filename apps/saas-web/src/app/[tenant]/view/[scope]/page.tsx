import { redirect } from "next/navigation";

interface ScopedTenantHomePageProps {
  params: Promise<{ tenant: string; scope: string }>;
}

export default async function ScopedTenantHomePage({ params }: ScopedTenantHomePageProps) {
  const resolvedParams = await params;
  const tenantSlug = resolvedParams.tenant;
  const normalizedScope = (resolvedParams.scope || "").trim().toLowerCase();

  if (normalizedScope !== "all") {
    redirect(`/${tenantSlug}/view/${resolvedParams.scope}/products`);
  }

  // Intentionally blank for now.
  return null;
}
