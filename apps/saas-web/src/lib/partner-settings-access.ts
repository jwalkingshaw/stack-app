const normalizePath = (value: string): string => {
  const withoutQuery = value.split("?")[0]?.split("#")[0] ?? value;
  const trimmed = withoutQuery.trim();
  if (!trimmed) return "/";
  return trimmed.endsWith("/") && trimmed.length > 1
    ? trimmed.slice(0, -1)
    : trimmed;
};

export function isPartnerSettingsPathAllowed(
  pathname: string,
  tenantSlug: string
): boolean {
  const normalizedPath = normalizePath(pathname);
  const settingsRoot = normalizePath(`/${tenantSlug}/settings`);
  const billingRoot = normalizePath(`/${tenantSlug}/settings/billing`);
  const bareSettingsRoot = normalizePath("/settings");
  const bareBillingRoot = normalizePath("/settings/billing");

  return (
    normalizedPath === settingsRoot ||
    normalizedPath === billingRoot ||
    normalizedPath.startsWith(`${billingRoot}/`) ||
    normalizedPath === bareSettingsRoot ||
    normalizedPath === bareBillingRoot ||
    normalizedPath.startsWith(`${bareBillingRoot}/`)
  );
}

export function buildPartnerSettingsRedirectPath(tenantSlug: string): string {
  return `/${tenantSlug}/settings/billing?source=partner_restricted`;
}
