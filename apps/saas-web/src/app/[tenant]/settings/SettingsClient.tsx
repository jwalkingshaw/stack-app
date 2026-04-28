'use client';

import OrganizationSettings from './components/OrganizationSettings';

interface SettingsClientProps {
  tenantSlug: string;
}

export default function SettingsClient({ tenantSlug }: SettingsClientProps) {
  return <OrganizationSettings tenantSlug={tenantSlug} />;
}
