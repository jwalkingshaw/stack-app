const normalizeEnumToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

const DAM_ENUM_ALIASES = {
  assetStatus: {
    active: "active",
    draft: "draft",
    archived: "archived",
    retired: "retired",
  },
  complianceStatus: {
    pending: "pending",
    approved: "approved",
    rejected: "rejected",
    under_review: "under_review",
    compliant: "approved",
    non_compliant: "rejected",
  },
  brandLegalApproval: {
    pending: "pending",
    approved: "approved",
    rejected: "rejected",
    not_required: "not_required",
  },
  artworkType: {
    label: "label",
    carton: "carton",
    shipper: "shipper",
    display: "display",
    digital: "digital",
    sell_sheet: "sell_sheet",
    other: "other",
  },
  colorProfile: {
    cmyk: "cmyk",
    rgb: "rgb",
    pms: "pms",
    pantone: "pms",
    spot: "spot",
    spot_color: "spot",
  },
  printVsDigital: {
    print: "print",
    digital: "digital",
    omnichannel: "omnichannel",
    omni_channel: "omnichannel",
  },
  licenseOwnership: {
    work_for_hire: "work_for_hire",
    ugc_license: "ugc_license",
    licensed: "licensed",
    owned: "owned",
    rights_managed: "rights_managed",
  },
  endorsementType: {
    athlete: "athlete",
    influencer: "influencer",
    creator: "creator",
    expert: "expert",
    practitioner: "expert",
    expert_practitioner: "expert",
    none: "none",
  },
  wadaRiskLevel: {
    none: "none",
    low: "low",
    medium: "medium",
    high: "high",
  },
} as const;

export type DamEnumField = keyof typeof DAM_ENUM_ALIASES;

const DAM_ASSET_FIELD_KEYS: Array<
  readonly [DamEnumField, camelKey: string, snakeKey: string]
> = [
  ["assetStatus", "assetStatus", "asset_status"],
  ["complianceStatus", "complianceStatus", "compliance_status"],
  ["brandLegalApproval", "brandLegalApproval", "brand_legal_approval"],
  ["artworkType", "artworkType", "artwork_type"],
  ["colorProfile", "colorProfile", "color_profile"],
  ["printVsDigital", "printVsDigital", "print_vs_digital"],
  ["licenseOwnership", "licenseOwnership", "license_ownership"],
  ["endorsementType", "endorsementType", "endorsement_type"],
  ["wadaRiskLevel", "wadaRiskLevel", "wada_risk_level"],
];

export function normalizeDamEnumValue(
  field: DamEnumField,
  value: unknown
): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeEnumToken(value);
  if (!normalized) return null;
  const aliases = DAM_ENUM_ALIASES[field] as Record<string, string>;
  return aliases[normalized] ?? null;
}

export function normalizeDamAssetRecord<T extends Record<string, any>>(asset: T): T {
  const normalizedAsset = { ...asset } as Record<string, any>;

  for (const [field, camelKey, snakeKey] of DAM_ASSET_FIELD_KEYS) {
    const rawValue =
      typeof normalizedAsset[camelKey] === "string"
        ? normalizedAsset[camelKey]
        : typeof normalizedAsset[snakeKey] === "string"
          ? normalizedAsset[snakeKey]
          : null;
    if (rawValue === null) continue;

    const normalizedValue = normalizeDamEnumValue(field, rawValue);
    if (!normalizedValue) continue;

    if (Object.prototype.hasOwnProperty.call(normalizedAsset, camelKey)) {
      normalizedAsset[camelKey] = normalizedValue;
    }
    if (Object.prototype.hasOwnProperty.call(normalizedAsset, snakeKey)) {
      normalizedAsset[snakeKey] = normalizedValue;
    }
  }

  return normalizedAsset as T;
}
