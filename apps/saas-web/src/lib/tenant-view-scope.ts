export const PARTNER_SCOPE_SELF = "self";
export const PARTNER_SCOPE_ALL = "all";

export type PartnerScope = string | null;

function normalizeSegment(value: string | null | undefined): string | null {
  const normalized = (value || "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isReservedPartnerScope(scope: string | null | undefined): boolean {
  const normalized = normalizeSegment(scope);
  return normalized === PARTNER_SCOPE_SELF || normalized === PARTNER_SCOPE_ALL;
}

export function extractPartnerScopeFromPath(
  pathname: string | null | undefined,
  tenantSlug: string
): PartnerScope {
  const normalizedTenant = normalizeSegment(tenantSlug);
  if (!normalizedTenant || !pathname) {
    return null;
  }

  const path = pathname.toLowerCase();
  const tenantPrefix = `/${normalizedTenant}`;
  if (!path.startsWith(tenantPrefix)) {
    return null;
  }

  const remainder = path.slice(tenantPrefix.length);
  const viewPrefix = "/view/";
  if (!remainder.startsWith(viewPrefix)) {
    return null;
  }

  const afterView = remainder.slice(viewPrefix.length);
  const nextSlashIndex = afterView.indexOf("/");
  const rawScope = nextSlashIndex >= 0 ? afterView.slice(0, nextSlashIndex) : afterView;
  return normalizeSegment(rawScope);
}

export function resolvePartnerSelectedBrandSlug(params: {
  pathname?: string | null;
  tenantSlug: string;
  fallbackBrandSlug?: string | null;
  organizationType?: "brand" | "partner";
}): string | null {
  const { pathname, tenantSlug, fallbackBrandSlug, organizationType } = params;
  if (organizationType !== "partner") {
    return null;
  }

  const tenant = normalizeSegment(tenantSlug);
  const pathScope = extractPartnerScopeFromPath(pathname, tenantSlug);
  if (pathScope) {
    if (!isReservedPartnerScope(pathScope) && pathScope !== tenant) {
      return pathScope;
    }
    // Explicit path scopes (e.g. /view/all) always win over legacy query fallback.
    return null;
  }

  const fallback = normalizeSegment(fallbackBrandSlug);
  if (!fallback || fallback === tenant || isReservedPartnerScope(fallback)) {
    return null;
  }

  return fallback;
}

export function splitTenantPathForScope(
  pathname: string | null | undefined,
  tenantSlug: string
): { scope: PartnerScope; suffix: string } {
  const normalizedTenant = normalizeSegment(tenantSlug);
  if (!normalizedTenant || !pathname) {
    return { scope: null, suffix: "" };
  }

  const path = pathname.toLowerCase();
  const tenantPrefix = `/${normalizedTenant}`;
  if (!path.startsWith(tenantPrefix)) {
    return { scope: null, suffix: "" };
  }

  const remainder = path.slice(tenantPrefix.length);
  if (!remainder || remainder === "/") {
    return { scope: null, suffix: "" };
  }

  const viewPrefix = "/view/";
  if (!remainder.startsWith(viewPrefix)) {
    return { scope: null, suffix: remainder };
  }

  const afterView = remainder.slice(viewPrefix.length);
  const nextSlashIndex = afterView.indexOf("/");
  if (nextSlashIndex < 0) {
    return {
      scope: normalizeSegment(afterView),
      suffix: "",
    };
  }

  return {
    scope: normalizeSegment(afterView.slice(0, nextSlashIndex)),
    suffix: afterView.slice(nextSlashIndex),
  };
}

export function buildTenantPathForScope(params: {
  tenantSlug: string;
  scope?: PartnerScope;
  suffix?: string;
}): string {
  const normalizedTenant = normalizeSegment(params.tenantSlug);
  if (!normalizedTenant) {
    return "/";
  }

  const normalizedScope = normalizeSegment(params.scope);
  const suffix = params.suffix || "";
  if (!normalizedScope || normalizedScope === PARTNER_SCOPE_SELF) {
    return `/${normalizedTenant}${suffix}`;
  }

  return `/${normalizedTenant}/view/${normalizedScope}${suffix}`;
}
