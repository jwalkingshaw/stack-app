export interface OrganizationProfile {
  website: string;
  description: string;
  logoUrl: string | null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function readOrganizationProfile(
  row: Record<string, unknown> | null | undefined
): OrganizationProfile {
  const source = row ?? {};
  const metadata = asRecord(source.metadata);
  const branding = asRecord(metadata?.branding);

  const website =
    normalizeOptionalString(source.website) ??
    normalizeOptionalString(metadata?.website) ??
    "";
  const description =
    normalizeOptionalString(source.description) ??
    normalizeOptionalString(metadata?.description) ??
    "";
  const logoUrl =
    normalizeOptionalString(source.logo_url) ??
    normalizeOptionalString(source.logoUrl) ??
    normalizeOptionalString(metadata?.logo_url) ??
    normalizeOptionalString(metadata?.logoUrl) ??
    normalizeOptionalString(branding?.logo_url) ??
    normalizeOptionalString(branding?.logoUrl);

  return {
    website,
    description,
    logoUrl: logoUrl ?? null,
  };
}

export function applyOrganizationProfileUpdate(params: {
  existingRow: Record<string, unknown>;
  website?: string | null;
  description?: string | null;
  logoUrl?: string | null;
}): Record<string, unknown> {
  const { existingRow } = params;
  const updatePayload: Record<string, unknown> = {};
  const hasField = (key: string) =>
    Object.prototype.hasOwnProperty.call(existingRow, key);

  const normalizedWebsite =
    params.website === undefined ? undefined : normalizeOptionalString(params.website);
  const normalizedDescription =
    params.description === undefined ? undefined : normalizeOptionalString(params.description);
  const normalizedLogoUrl =
    params.logoUrl === undefined ? undefined : normalizeOptionalString(params.logoUrl);

  if (normalizedWebsite !== undefined && hasField("website")) {
    updatePayload.website = normalizedWebsite;
  }
  if (normalizedDescription !== undefined && hasField("description")) {
    updatePayload.description = normalizedDescription;
  }
  if (normalizedLogoUrl !== undefined && hasField("logo_url")) {
    updatePayload.logo_url = normalizedLogoUrl;
  }

  if (hasField("metadata")) {
    const currentMetadata = asRecord(existingRow.metadata) ?? {};
    const nextMetadata: Record<string, unknown> = { ...currentMetadata };
    const currentBranding = asRecord(currentMetadata.branding) ?? {};

    if (normalizedWebsite !== undefined) {
      nextMetadata.website = normalizedWebsite;
    }
    if (normalizedDescription !== undefined) {
      nextMetadata.description = normalizedDescription;
    }
    if (normalizedLogoUrl !== undefined) {
      nextMetadata.logoUrl = normalizedLogoUrl;
      nextMetadata.branding = {
        ...currentBranding,
        logoUrl: normalizedLogoUrl,
      };
    }

    updatePayload.metadata = nextMetadata;
  }

  return updatePayload;
}
