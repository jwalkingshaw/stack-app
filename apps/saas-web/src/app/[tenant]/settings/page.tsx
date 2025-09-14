import SettingsClient from "./SettingsClient";

interface SettingsPageProps {
  params: Promise<{ tenant: string }>
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const resolvedParams = await params
  const tenantSlug = resolvedParams.tenant

  // Server component - auth and organization data is already available from layout
  return (
    <SettingsClient tenantSlug={tenantSlug} />
  );
}