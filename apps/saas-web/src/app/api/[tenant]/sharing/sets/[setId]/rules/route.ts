import { NextRequest, NextResponse } from "next/server";
import type { Database, Json } from "@stack-app/database";
import { supabaseServer } from "@/lib/supabase";
import { invalidateCatalogVisibilityCaches } from "@/lib/catalog-cache";
import { invalidatePartnerGrantCachesForBrand } from "@/lib/partner-brand-view";
import {
  isMissingTableError,
  normalizeUuidArray,
  requireSharingManagerContext,
} from "../../../_shared";

type ShareSetModule = "assets" | "products";

type ShareSetRecord = {
  id: string;
  module_key: ShareSetModule;
};

type ShareSetDynamicRule = {
  id: string;
  share_set_id: string;
  organization_id: string;
  name: string | null;
  is_active: boolean;
  priority: number;
  // Tag / folder / usage group
  include_tags: string[];
  include_folder_ids: string[];
  include_usage_group_ids: string[];
  exclude_tags: string[];
  exclude_folder_ids: string[];
  // New asset conditions
  include_compliance_statuses: string[];
  exclude_compliance_statuses: string[];
  include_brand_legal_approvals: string[];
  exclude_brand_legal_approvals: string[];
  include_asset_statuses: string[];
  exclude_asset_statuses: string[];
  include_file_types: string[];
  exclude_file_types: string[];
  include_artwork_types: string[];
  exclude_artwork_types: string[];
  include_print_vs_digital: string | null;
  include_certifications: string[];
  exclude_certifications: string[];
  include_regulatory_regions: string[];
  exclude_regulatory_regions: string[];
  include_wada_risk_levels: string[];
  exclude_wada_risk_levels: string[];
  require_talent_release: boolean;
  usage_end_within_days: number | null;
  // Product conditions
  include_product_types: string[];
  include_product_family_ids: string[];
  include_product_name_contains: string[];
  exclude_product_types: string[];
  exclude_product_family_ids: string[];
  exclude_product_name_contains: string[];
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type LegacyShareSetRuleRow = ShareSetDynamicRule;

type LegacyShareSetQueryRow = {
  id: string;
  module_key: ShareSetModule;
};

type ShareSetDynamicRuleMutationPayload = {
  organization_id?: string;
  share_set_id?: string;
  name?: string | null;
  is_active?: boolean;
  priority?: number;
  include_tags?: string[];
  include_folder_ids?: string[];
  include_usage_group_ids?: string[];
  exclude_tags?: string[];
  exclude_folder_ids?: string[];
  include_compliance_statuses?: string[];
  exclude_compliance_statuses?: string[];
  include_brand_legal_approvals?: string[];
  exclude_brand_legal_approvals?: string[];
  include_asset_statuses?: string[];
  exclude_asset_statuses?: string[];
  include_file_types?: string[];
  exclude_file_types?: string[];
  include_artwork_types?: string[];
  exclude_artwork_types?: string[];
  include_print_vs_digital?: string | null;
  include_certifications?: string[];
  exclude_certifications?: string[];
  include_regulatory_regions?: string[];
  exclude_regulatory_regions?: string[];
  include_wada_risk_levels?: string[];
  exclude_wada_risk_levels?: string[];
  require_talent_release?: boolean;
  usage_end_within_days?: number | null;
  include_product_types?: string[];
  include_product_family_ids?: string[];
  include_product_name_contains?: string[];
  exclude_product_types?: string[];
  exclude_product_family_ids?: string[];
  exclude_product_name_contains?: string[];
  metadata?: Json;
  created_by?: string | null;
};

const ALLOWED_PRODUCT_TYPES = new Set(["parent", "variant", "standalone"]);

const RULE_SELECT_COLUMNS = [
  "id", "share_set_id", "organization_id", "name", "is_active", "priority",
  // Tag / folder / usage group
  "include_tags", "include_folder_ids", "include_usage_group_ids",
  "exclude_tags", "exclude_folder_ids",
  // Asset conditions
  "include_compliance_statuses", "exclude_compliance_statuses",
  "include_brand_legal_approvals", "exclude_brand_legal_approvals",
  "include_asset_statuses", "exclude_asset_statuses",
  "include_file_types", "exclude_file_types",
  "include_artwork_types", "exclude_artwork_types",
  "include_print_vs_digital",
  "include_certifications", "exclude_certifications",
  "include_regulatory_regions", "exclude_regulatory_regions",
  "include_wada_risk_levels", "exclude_wada_risk_levels",
  "require_talent_release", "usage_end_within_days",
  // Product conditions
  "include_product_types", "include_product_family_ids", "include_product_name_contains",
  "exclude_product_types", "exclude_product_family_ids", "exclude_product_name_contains",
  "metadata", "created_by", "created_at", "updated_at",
].join(",");

function isMissingRuleFoundationError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (isMissingTableError(error) || code === "PGRST205" || code === "42703") return true;
  const message = String((error as { message?: string }).message || "").toLowerCase();
  return (
    message.includes("share_set_dynamic_rules") ||
    message.includes("share_set_items") ||
    message.includes("share_sets") ||
    message.includes("include_product_family_ids") ||
    message.includes("exclude_product_family_ids") ||
    message.includes("include_product_name_contains") ||
    message.includes("exclude_product_name_contains") ||
    message.includes("include_compliance_statuses") ||
    message.includes("include_brand_legal_approvals") ||
    message.includes("include_asset_statuses") ||
    message.includes("include_file_types") ||
    message.includes("include_artwork_types") ||
    message.includes("include_print_vs_digital") ||
    message.includes("include_certifications") ||
    message.includes("include_regulatory_regions") ||
    message.includes("include_wada_risk_levels") ||
    message.includes("require_talent_release") ||
    message.includes("usage_end_within_days")
  );
}

function normalizeStringArray(value: unknown, options?: { lowercase?: boolean }): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    deduped.add(options?.lowercase ? trimmed.toLowerCase() : trimmed);
  }
  return Array.from(deduped);
}

function normalizeRuleInput(raw: unknown): {
  name: string | null;
  isActive: boolean;
  priority: number;
  // Tag / folder / usage group
  includeTags: string[];
  includeFolderIds: string[];
  includeUsageGroupIds: string[];
  excludeTags: string[];
  excludeFolderIds: string[];
  // Asset conditions
  includeComplianceStatuses: string[];
  excludeComplianceStatuses: string[];
  includeBrandLegalApprovals: string[];
  excludeBrandLegalApprovals: string[];
  includeAssetStatuses: string[];
  excludeAssetStatuses: string[];
  includeFileTypes: string[];
  excludeFileTypes: string[];
  includeArtworkTypes: string[];
  excludeArtworkTypes: string[];
  includePrintVsDigital: string | null;
  includeCertifications: string[];
  excludeCertifications: string[];
  includeRegulatoryRegions: string[];
  excludeRegulatoryRegions: string[];
  includeWadaRiskLevels: string[];
  excludeWadaRiskLevels: string[];
  requireTalentRelease: boolean;
  usageEndWithinDays: number | null;
  // Product conditions
  includeProductTypes: string[];
  includeProductFamilyIds: string[];
  includeProductNameContains: string[];
  excludeProductTypes: string[];
  excludeProductFamilyIds: string[];
  excludeProductNameContains: string[];
  metadata: Record<string, unknown>;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;

  const name =
    typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : null;
  const isActive =
    typeof input.isActive === "boolean"
      ? input.isActive
      : typeof input.is_active === "boolean"
        ? input.is_active
        : true;
  const priorityRaw =
    typeof input.priority === "number"
      ? input.priority
      : typeof input.priority === "string"
        ? Number(input.priority)
        : 100;
  const priority = Number.isFinite(priorityRaw) ? Math.max(0, Math.floor(priorityRaw)) : 100;

  const metadata =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : {};

  const usageEndWithinDaysRaw =
    typeof input.usageEndWithinDays === "number"
      ? input.usageEndWithinDays
      : typeof input.usage_end_within_days === "number"
        ? input.usage_end_within_days
        : null;
  const usageEndWithinDays =
    usageEndWithinDaysRaw !== null && Number.isFinite(usageEndWithinDaysRaw) && usageEndWithinDaysRaw > 0
      ? Math.floor(usageEndWithinDaysRaw)
      : null;

  const includePrintVsDigitalRaw =
    typeof input.includePrintVsDigital === "string"
      ? input.includePrintVsDigital
      : typeof input.include_print_vs_digital === "string"
        ? input.include_print_vs_digital
        : null;
  const includePrintVsDigital =
    includePrintVsDigitalRaw === "print" || includePrintVsDigitalRaw === "digital"
      ? includePrintVsDigitalRaw
      : null;

  const requireTalentRelease =
    typeof input.requireTalentRelease === "boolean"
      ? input.requireTalentRelease
      : typeof input.require_talent_release === "boolean"
        ? input.require_talent_release
        : false;

  return {
    name,
    isActive,
    priority,
    includeTags: normalizeStringArray(input.includeTags, { lowercase: true }),
    includeFolderIds: normalizeUuidArray(input.includeFolderIds),
    includeUsageGroupIds: normalizeStringArray(input.includeUsageGroupIds, { lowercase: true }),
    excludeTags: normalizeStringArray(input.excludeTags, { lowercase: true }),
    excludeFolderIds: normalizeUuidArray(input.excludeFolderIds),
    // Asset conditions
    includeComplianceStatuses: normalizeStringArray(input.includeComplianceStatuses),
    excludeComplianceStatuses: normalizeStringArray(input.excludeComplianceStatuses),
    includeBrandLegalApprovals: normalizeStringArray(input.includeBrandLegalApprovals),
    excludeBrandLegalApprovals: normalizeStringArray(input.excludeBrandLegalApprovals),
    includeAssetStatuses: normalizeStringArray(input.includeAssetStatuses),
    excludeAssetStatuses: normalizeStringArray(input.excludeAssetStatuses),
    includeFileTypes: normalizeStringArray(input.includeFileTypes, { lowercase: true }),
    excludeFileTypes: normalizeStringArray(input.excludeFileTypes, { lowercase: true }),
    includeArtworkTypes: normalizeStringArray(input.includeArtworkTypes),
    excludeArtworkTypes: normalizeStringArray(input.excludeArtworkTypes),
    includePrintVsDigital,
    includeCertifications: normalizeStringArray(input.includeCertifications),
    excludeCertifications: normalizeStringArray(input.excludeCertifications),
    includeRegulatoryRegions: normalizeStringArray(input.includeRegulatoryRegions),
    excludeRegulatoryRegions: normalizeStringArray(input.excludeRegulatoryRegions),
    includeWadaRiskLevels: normalizeStringArray(input.includeWadaRiskLevels, { lowercase: true }),
    excludeWadaRiskLevels: normalizeStringArray(input.excludeWadaRiskLevels, { lowercase: true }),
    requireTalentRelease,
    usageEndWithinDays,
    // Product conditions
    includeProductTypes: normalizeStringArray(input.includeProductTypes, { lowercase: true }),
    includeProductFamilyIds: normalizeUuidArray(input.includeProductFamilyIds),
    includeProductNameContains: normalizeStringArray(input.includeProductNameContains, {
      lowercase: true,
    }),
    excludeProductTypes: normalizeStringArray(input.excludeProductTypes, { lowercase: true }),
    excludeProductFamilyIds: normalizeUuidArray(input.excludeProductFamilyIds),
    excludeProductNameContains: normalizeStringArray(input.excludeProductNameContains, {
      lowercase: true,
    }),
    metadata,
  };
}

function validateRuleForModule(params: {
  moduleKey: ShareSetModule;
  input: ReturnType<typeof normalizeRuleInput>;
}): { ok: true } | { ok: false; status: number; error: string } {
  const { moduleKey, input } = params;
  if (!input) {
    return { ok: false, status: 400, error: "Invalid rule payload" };
  }

  if (moduleKey === "assets") {
    if (
      input.includeProductTypes.length > 0 ||
      input.excludeProductTypes.length > 0 ||
      input.includeProductFamilyIds.length > 0 ||
      input.excludeProductFamilyIds.length > 0 ||
      input.includeProductNameContains.length > 0 ||
      input.excludeProductNameContains.length > 0
    ) {
      return {
        ok: false,
        status: 400,
        error: "Asset rules do not support product conditions",
      };
    }
    const hasInclude =
      input.includeTags.length > 0 ||
      input.includeFolderIds.length > 0 ||
      input.includeUsageGroupIds.length > 0 ||
      input.includeComplianceStatuses.length > 0 ||
      input.includeBrandLegalApprovals.length > 0 ||
      input.includeAssetStatuses.length > 0 ||
      input.includeFileTypes.length > 0 ||
      input.includeArtworkTypes.length > 0 ||
      input.includePrintVsDigital !== null ||
      input.includeCertifications.length > 0 ||
      input.includeRegulatoryRegions.length > 0 ||
      input.includeWadaRiskLevels.length > 0 ||
      input.requireTalentRelease ||
      input.usageEndWithinDays !== null;
    if (!hasInclude) {
      return {
        ok: false,
        status: 400,
        error: "Asset rule must include at least one include condition",
      };
    }
    return { ok: true };
  }

  const invalidIncludeType = input.includeProductTypes.find((type) => !ALLOWED_PRODUCT_TYPES.has(type));
  if (invalidIncludeType) {
    return {
      ok: false,
      status: 400,
      error: `Invalid includeProductTypes value: ${invalidIncludeType}`,
    };
  }
  const invalidExcludeType = input.excludeProductTypes.find((type) => !ALLOWED_PRODUCT_TYPES.has(type));
  if (invalidExcludeType) {
    return {
      ok: false,
      status: 400,
      error: `Invalid excludeProductTypes value: ${invalidExcludeType}`,
    };
  }

  const hasProductInclude =
    input.includeProductTypes.length > 0 ||
    input.includeProductFamilyIds.length > 0 ||
    input.includeProductNameContains.length > 0;

  if (!hasProductInclude) {
    return {
      ok: false,
      status: 400,
      error: "Product rule must include at least one include condition (family/model or name contains)",
    };
  }

  return { ok: true };
}

async function getShareSet(params: {
  organizationId: string;
  setId: string;
}): Promise<{ ok: true; data: ShareSetRecord } | { ok: false; status: number; error: string }> {
  const query = (supabaseServer.from("share_sets") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: LegacyShareSetQueryRow | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
  })
    .select("id,module_key")
    .eq("organization_id", params.organizationId)
    .eq("id", params.setId)
    .maybeSingle();

  const { data, error } = await query;

  if (error) {
    if (isMissingRuleFoundationError(error)) {
      return {
        ok: false,
        status: 503,
        error: "Saved scope rules foundation is unavailable. Apply database migrations first.",
      };
    }
    return { ok: false, status: 500, error: "Failed to resolve saved scope" };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Saved scope not found" };
  }

  return { ok: true, data: { id: data.id, module_key: data.module_key } };
}

// GET /api/[tenant]/sharing/sets/[setId]/rules
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireSharingManagerContext(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const setResult = await getShareSet({ organizationId: organization.id, setId: resolved.setId });
    if (!setResult.ok) {
      return NextResponse.json({ error: setResult.error }, { status: setResult.status });
    }

    const query = (supabaseServer.from("share_set_dynamic_rules") as unknown as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            order: (column: string, options: { ascending: boolean }) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{
                data: LegacyShareSetRuleRow[] | null;
                error: { code?: string; message?: string } | null;
              }>;
            };
          };
        };
      };
    })
      .select(
        RULE_SELECT_COLUMNS
      )
      .eq("organization_id", organization.id)
      .eq("share_set_id", setResult.data.id)
      .order("priority", { ascending: true })
      .order("updated_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      if (isMissingRuleFoundationError(error)) {
        return NextResponse.json(
          { error: "Saved scope rules foundation is unavailable. Apply database migrations first." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to load set rules" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        set: setResult.data,
        rules: data || [],
      },
    });
  } catch (error) {
    console.error("Error in set rules GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/sharing/sets/[setId]/rules
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireSharingManagerContext(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const setResult = await getShareSet({ organizationId: organization.id, setId: resolved.setId });
    if (!setResult.ok) {
      return NextResponse.json({ error: setResult.error }, { status: setResult.status });
    }

    const body = await request.json().catch(() => ({}));
    const input = normalizeRuleInput(body);
    const validation = validateRuleForModule({ moduleKey: setResult.data.module_key, input });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const payload: ShareSetDynamicRuleMutationPayload = {
      organization_id: organization.id,
      share_set_id: setResult.data.id,
      name: input!.name,
      is_active: input!.isActive,
      priority: input!.priority,
      // Tag / folder / usage group
      include_tags: input!.includeTags,
      include_folder_ids: input!.includeFolderIds,
      include_usage_group_ids: input!.includeUsageGroupIds,
      exclude_tags: input!.excludeTags,
      exclude_folder_ids: input!.excludeFolderIds,
      // Asset conditions
      include_compliance_statuses: input!.includeComplianceStatuses,
      exclude_compliance_statuses: input!.excludeComplianceStatuses,
      include_brand_legal_approvals: input!.includeBrandLegalApprovals,
      exclude_brand_legal_approvals: input!.excludeBrandLegalApprovals,
      include_asset_statuses: input!.includeAssetStatuses,
      exclude_asset_statuses: input!.excludeAssetStatuses,
      include_file_types: input!.includeFileTypes,
      exclude_file_types: input!.excludeFileTypes,
      include_artwork_types: input!.includeArtworkTypes,
      exclude_artwork_types: input!.excludeArtworkTypes,
      include_print_vs_digital: input!.includePrintVsDigital,
      include_certifications: input!.includeCertifications,
      exclude_certifications: input!.excludeCertifications,
      include_regulatory_regions: input!.includeRegulatoryRegions,
      exclude_regulatory_regions: input!.excludeRegulatoryRegions,
      include_wada_risk_levels: input!.includeWadaRiskLevels,
      exclude_wada_risk_levels: input!.excludeWadaRiskLevels,
      require_talent_release: input!.requireTalentRelease,
      usage_end_within_days: input!.usageEndWithinDays,
      // Product conditions
      include_product_types: input!.includeProductTypes,
      include_product_family_ids: input!.includeProductFamilyIds,
      include_product_name_contains: input!.includeProductNameContains,
      exclude_product_types: input!.excludeProductTypes,
      exclude_product_family_ids: input!.excludeProductFamilyIds,
      exclude_product_name_contains: input!.excludeProductNameContains,
      metadata: input!.metadata as Json,
      created_by: userId,
    };

    const query = (supabaseServer.from("share_set_dynamic_rules") as unknown as {
      insert: (payload: ShareSetDynamicRuleMutationPayload) => {
        select: (columns: string) => {
          single: () => Promise<{
            data: LegacyShareSetRuleRow | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    })
      .insert(payload)
      .select(
        RULE_SELECT_COLUMNS
      )
      .single();

    const { data, error } = await query;

    if (error) {
      if (isMissingRuleFoundationError(error)) {
        return NextResponse.json(
          { error: "Saved scope rules foundation is unavailable. Apply database migrations first." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to create set rule" }, { status: 500 });
    }

    await invalidateCatalogVisibilityCaches({
      organizationId: organization.id,
      includeProducts: setResult.data.module_key === "products",
      includeAssets: setResult.data.module_key === "assets",
      includePartnerCatalogExport: setResult.data.module_key === "products",
    });
    invalidatePartnerGrantCachesForBrand(organization.id);

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Error in set rules POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/[tenant]/sharing/sets/[setId]/rules?ruleId=...
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireSharingManagerContext(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const setResult = await getShareSet({ organizationId: organization.id, setId: resolved.setId });
    if (!setResult.ok) {
      return NextResponse.json({ error: setResult.error }, { status: setResult.status });
    }

    const ruleId = new URL(request.url).searchParams.get("ruleId")?.trim();
    if (!ruleId) {
      return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const input = normalizeRuleInput(body);
    const validation = validateRuleForModule({ moduleKey: setResult.data.module_key, input });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const updatePayload: ShareSetDynamicRuleMutationPayload = {
      name: input!.name,
      is_active: input!.isActive,
      priority: input!.priority,
      // Tag / folder / usage group
      include_tags: input!.includeTags,
      include_folder_ids: input!.includeFolderIds,
      include_usage_group_ids: input!.includeUsageGroupIds,
      exclude_tags: input!.excludeTags,
      exclude_folder_ids: input!.excludeFolderIds,
      // Asset conditions
      include_compliance_statuses: input!.includeComplianceStatuses,
      exclude_compliance_statuses: input!.excludeComplianceStatuses,
      include_brand_legal_approvals: input!.includeBrandLegalApprovals,
      exclude_brand_legal_approvals: input!.excludeBrandLegalApprovals,
      include_asset_statuses: input!.includeAssetStatuses,
      exclude_asset_statuses: input!.excludeAssetStatuses,
      include_file_types: input!.includeFileTypes,
      exclude_file_types: input!.excludeFileTypes,
      include_artwork_types: input!.includeArtworkTypes,
      exclude_artwork_types: input!.excludeArtworkTypes,
      include_print_vs_digital: input!.includePrintVsDigital,
      include_certifications: input!.includeCertifications,
      exclude_certifications: input!.excludeCertifications,
      include_regulatory_regions: input!.includeRegulatoryRegions,
      exclude_regulatory_regions: input!.excludeRegulatoryRegions,
      include_wada_risk_levels: input!.includeWadaRiskLevels,
      exclude_wada_risk_levels: input!.excludeWadaRiskLevels,
      require_talent_release: input!.requireTalentRelease,
      usage_end_within_days: input!.usageEndWithinDays,
      // Product conditions
      include_product_types: input!.includeProductTypes,
      include_product_family_ids: input!.includeProductFamilyIds,
      include_product_name_contains: input!.includeProductNameContains,
      exclude_product_types: input!.excludeProductTypes,
      exclude_product_family_ids: input!.excludeProductFamilyIds,
      exclude_product_name_contains: input!.excludeProductNameContains,
      metadata: input!.metadata as Json,
    };

    const query = (supabaseServer.from("share_set_dynamic_rules") as unknown as {
      update: (payload: ShareSetDynamicRuleMutationPayload) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              select: (columns: string) => {
                maybeSingle: () => Promise<{
                  data: LegacyShareSetRuleRow | null;
                  error: { code?: string; message?: string } | null;
                }>;
              };
            };
          };
        };
      };
    })
      .update(updatePayload)
      .eq("organization_id", organization.id)
      .eq("share_set_id", setResult.data.id)
      .eq("id", ruleId)
      .select(
        RULE_SELECT_COLUMNS
      )
      .maybeSingle();

    const { data, error } = await query;

    if (error) {
      if (isMissingRuleFoundationError(error)) {
        return NextResponse.json(
          { error: "Saved scope rules foundation is unavailable. Apply database migrations first." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to update set rule" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    await invalidateCatalogVisibilityCaches({
      organizationId: organization.id,
      includeProducts: setResult.data.module_key === "products",
      includeAssets: setResult.data.module_key === "assets",
      includePartnerCatalogExport: setResult.data.module_key === "products",
    });
    invalidatePartnerGrantCachesForBrand(organization.id);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in set rules PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/sharing/sets/[setId]/rules?ruleId=...
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireSharingManagerContext(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const setResult = await getShareSet({ organizationId: organization.id, setId: resolved.setId });
    if (!setResult.ok) {
      return NextResponse.json({ error: setResult.error }, { status: setResult.status });
    }

    const ruleId = new URL(request.url).searchParams.get("ruleId")?.trim();
    if (!ruleId) {
      return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("share_set_dynamic_rules")
      .delete()
      .eq("organization_id", organization.id)
      .eq("share_set_id", setResult.data.id)
      .eq("id", ruleId);

    if (error) {
      if (isMissingRuleFoundationError(error)) {
        return NextResponse.json(
          { error: "Saved scope rules foundation is unavailable. Apply database migrations first." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Failed to delete set rule" }, { status: 500 });
    }

    await invalidateCatalogVisibilityCaches({
      organizationId: organization.id,
      includeProducts: setResult.data.module_key === "products",
      includeAssets: setResult.data.module_key === "assets",
      includePartnerCatalogExport: setResult.data.module_key === "products",
    });
    invalidatePartnerGrantCachesForBrand(organization.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in set rules DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

