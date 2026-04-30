import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import type { Organization } from "@stack-app/types";
import { verifyTenantAccess } from "@/lib/tenant-auth";
import { getSupabaseServer } from "@/lib/supabase";
import { blockPartnerBrandMutation } from "@/lib/partner-brand-mutation-guard";

type ScopeType = "organization" | "market" | "channel" | "collection";
type ShareSetModuleKey = "assets" | "products";
type PartnerGrantedAssetIdsResult = { foundationAvailable: boolean; assetIds: string[] };
type PartnerGrantedProductIdsResult = { foundationAvailable: boolean; productIds: string[] };
type PartnerGrantScopeSelection = {
  marketId?: string | null;
  channelId?: string | null;
  destinationProfileId?: string | null;
  localeId?: string | null;
  destinationId?: string | null;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export type PartnerProductVisibilityPolicyResult = {
  foundationAvailable: boolean;
  allowAllGroups: boolean;
  allowedGroupCodes: string[];
  allowedFieldCodes: string[];
};

const parsedGrantCacheTtlMs = Number(process.env.PARTNER_GRANT_CACHE_TTL_MS);
const PARTNER_GRANT_CACHE_TTL_MS =
  Number.isFinite(parsedGrantCacheTtlMs) && parsedGrantCacheTtlMs > 0
    ? parsedGrantCacheTtlMs
    : 10_000;
const parsedGrantCacheMaxKeys = Number(process.env.PARTNER_GRANT_CACHE_MAX_KEYS);
const PARTNER_GRANT_CACHE_MAX_KEYS =
  Number.isFinite(parsedGrantCacheMaxKeys) && parsedGrantCacheMaxKeys > 0
    ? Math.floor(parsedGrantCacheMaxKeys)
    : 500;

const partnerGrantedAssetIdsCache = new Map<
  string,
  { expiresAt: number; value: PartnerGrantedAssetIdsResult }
>();
const partnerGrantedAssetIdsInFlight = new Map<
  string,
  Promise<PartnerGrantedAssetIdsResult>
>();
const partnerGrantedProductIdsCache = new Map<
  string,
  { expiresAt: number; value: PartnerGrantedProductIdsResult }
>();
const partnerGrantedProductIdsInFlight = new Map<
  string,
  Promise<PartnerGrantedProductIdsResult>
>();

export function invalidatePartnerGrantCachesForBrand(brandOrganizationId: string): void {
  const productPrefix = `products:${brandOrganizationId}:`;
  const assetPrefix = `assets:${brandOrganizationId}:`;

  for (const key of partnerGrantedProductIdsCache.keys()) {
    if (key.startsWith(productPrefix)) {
      partnerGrantedProductIdsCache.delete(key);
    }
  }
  for (const key of partnerGrantedProductIdsInFlight.keys()) {
    if (key.startsWith(productPrefix)) {
      partnerGrantedProductIdsInFlight.delete(key);
    }
  }
  for (const key of partnerGrantedAssetIdsCache.keys()) {
    if (key.startsWith(assetPrefix)) {
      partnerGrantedAssetIdsCache.delete(key);
    }
  }
  for (const key of partnerGrantedAssetIdsInFlight.keys()) {
    if (key.startsWith(assetPrefix)) {
      partnerGrantedAssetIdsInFlight.delete(key);
    }
  }
}

function buildPartnerGrantCacheKey(
  moduleKey: ShareSetModuleKey,
  brandOrganizationId: string,
  partnerOrganizationId: string,
  scope?: PartnerGrantScopeSelection
): string {
  const normalize = (value: string | null | undefined) => {
    const token = typeof value === "string" ? value.trim() : "";
    return token.length > 0 ? token : "_";
  };
  const destinationProfileId = scope?.destinationProfileId ?? scope?.channelId;
  const scopeToken = scope
    ? `m=${normalize(scope.marketId)}|p=${normalize(destinationProfileId)}|l=${normalize(scope.localeId)}|d=${normalize(scope.destinationId)}`
    : "scope=all";
  return `${moduleKey}:${brandOrganizationId}:${partnerOrganizationId}:${scopeToken}`;
}

function prunePartnerGrantCache<T>(
  cache: Map<string, { expiresAt: number; value: T }>
): void {
  if (cache.size <= PARTNER_GRANT_CACHE_MAX_KEYS) return;

  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
  if (cache.size <= PARTNER_GRANT_CACHE_MAX_KEYS) return;

  const overflow = cache.size - PARTNER_GRANT_CACHE_MAX_KEYS;
  let removed = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function clonePartnerGrantedAssetIdsResult(
  value: PartnerGrantedAssetIdsResult
): PartnerGrantedAssetIdsResult {
  return {
    foundationAvailable: value.foundationAvailable,
    assetIds: [...value.assetIds],
  };
}

function clonePartnerGrantedProductIdsResult(
  value: PartnerGrantedProductIdsResult
): PartnerGrantedProductIdsResult {
  return {
    foundationAvailable: value.foundationAvailable,
    productIds: [...value.productIds],
  };
}

type OrganizationSummary = {
  id: string;
  slug: string;
  name: string;
  organizationType: "brand" | "partner";
};

export const ASSET_VIEW_PERMISSION_KEYS = [
  "asset.download.derivative",
  "asset.download.original",
  "asset.metadata.edit",
  "asset.upload",
  "asset.version.manage",
];

export const PRODUCT_VIEW_PERMISSION_KEYS = [
  "product.market.scope.read",
  "product.market.scope.edit",
  "product.attribute.edit",
  "product.publish.state",
];

export type ScopedPermissionSummary = {
  hasOrganizationScope: boolean;
  marketIds: string[];
  channelIds: string[];
  collectionIds: string[];
};

export type TenantBrandViewContext = {
  userId: string;
  userEmail: string | null;
  tenantOrganization: OrganizationSummary;
  targetOrganization: OrganizationSummary;
  selectedBrandSlug: string | null;
  mode: "tenant" | "partner_brand";
  brandMemberId: string | null;
};

function isMutatingRequestMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.trim().toUpperCase());
}

function normalizeOrganizationType(raw: unknown): "brand" | "partner" {
  return raw === "partner" ? "partner" : "brand";
}

function toOrganizationSummary(raw: Organization): OrganizationSummary {
  const organization = raw as Organization & {
    organizationType?: unknown;
    type?: unknown;
  };
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    organizationType: normalizeOrganizationType(
      organization.organizationType ?? organization.type
    ),
  };
}

function isMissingColumnError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703";
}

function isMissingShareSetFoundationError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error?.code === "42P01" || error?.code === "PGRST205") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("share_sets") ||
    message.includes("share_set_items") ||
    message.includes("partner_share_set_grants")
  );
}

async function resolveActivePartnerShareSetIds(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  moduleKey: ShareSetModuleKey;
}): Promise<{ foundationAvailable: boolean; setIds: string[] }> {
  const { brandOrganizationId, partnerOrganizationId, moduleKey } = params;
  const now = Date.now();

  const { data: grants, error: grantsError } = await getSupabaseServer()
    .from("partner_share_set_grants")
    .select("share_set_id,expires_at,valid_from")
    .eq("organization_id", brandOrganizationId)
    .eq("partner_organization_id", partnerOrganizationId)
    .eq("status", "active");

  if (grantsError) {
    if (isMissingShareSetFoundationError(grantsError)) {
      return { foundationAvailable: false, setIds: [] };
    }
    console.error("Failed to resolve partner saved scope grants:", grantsError);
    return { foundationAvailable: true, setIds: [] };
  }

  const unexpiredSetIds = Array.from(
    new Set(
      ((grants || []) as unknown as Array<{ share_set_id: string | null; expires_at: string | null; valid_from: string | null }>)
        .filter((grant) => {
          if (!grant.share_set_id) return false;
          // Respect valid_from: grant is not active until this date
          if (grant.valid_from) {
            const validFrom = Date.parse(grant.valid_from);
            if (Number.isFinite(validFrom) && validFrom > now) return false;
          }
          if (!grant.expires_at) return true;
          const expiresAt = Date.parse(grant.expires_at);
          return Number.isFinite(expiresAt) && expiresAt > now;
        })
        .map((grant) => grant.share_set_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (unexpiredSetIds.length === 0) {
    return { foundationAvailable: true, setIds: [] };
  }

  const { data: sets, error: setsError } = await getSupabaseServer()
    .from("share_sets")
    .select("id")
    .eq("organization_id", brandOrganizationId)
    .eq("module_key", moduleKey)
    .in("id", unexpiredSetIds);

  if (setsError) {
    if (isMissingShareSetFoundationError(setsError)) {
      return { foundationAvailable: false, setIds: [] };
    }
    console.error("Failed to resolve saved scope headers:", setsError);
    return { foundationAvailable: true, setIds: [] };
  }

  return {
    foundationAvailable: true,
    setIds: Array.from(
      new Set(
        ((sets || []) as Array<{ id: string | null }>)
          .map((row) => row.id)
          .filter((id): id is string => Boolean(id))
      )
    ),
  };
}

function normalizeVisibilityCodeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim().toLowerCase();
    if (!normalized) continue;
    out.add(normalized);
  }
  return Array.from(out);
}

function readProductVisibilityPolicyFromMetadata(metadata: unknown): {
  configured: boolean;
  allowAllGroups: boolean;
  allowedGroupCodes: string[];
  allowedFieldCodes: string[];
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      configured: false,
      allowAllGroups: false,
      allowedGroupCodes: [],
      allowedFieldCodes: [],
    };
  }

  const metadataRecord = metadata as Record<string, unknown>;
  const visibilityRaw =
    metadataRecord.product_visibility ?? metadataRecord.productVisibility ?? null;

  if (!visibilityRaw || typeof visibilityRaw !== "object" || Array.isArray(visibilityRaw)) {
    return {
      configured: false,
      allowAllGroups: false,
      allowedGroupCodes: [],
      allowedFieldCodes: [],
    };
  }

  const visibility = visibilityRaw as Record<string, unknown>;
  const allowAllGroups =
    visibility.allow_all_groups === true || visibility.allowAllGroups === true;
  const allowedGroupCodes = normalizeVisibilityCodeArray(
    visibility.allowed_group_codes ?? visibility.allowedGroupCodes
  );
  const allowedFieldCodes = normalizeVisibilityCodeArray(
    visibility.allowed_field_codes ?? visibility.allowedFieldCodes
  );

  return {
    configured: true,
    allowAllGroups,
    allowedGroupCodes,
    allowedFieldCodes,
  };
}

export async function resolvePartnerProductVisibilityPolicy(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
}): Promise<PartnerProductVisibilityPolicyResult> {
  const activeSetIds = await resolveActivePartnerShareSetIds({
    brandOrganizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId,
    moduleKey: "products",
  });

  if (!activeSetIds.foundationAvailable) {
    return {
      foundationAvailable: false,
      allowAllGroups: false,
      allowedGroupCodes: [],
      allowedFieldCodes: [],
    };
  }

  if (activeSetIds.setIds.length === 0) {
    return {
      foundationAvailable: true,
      allowAllGroups: false,
      allowedGroupCodes: [],
      allowedFieldCodes: [],
    };
  }

  const { data: setRows, error: setRowsError } = await getSupabaseServer()
    .from("share_sets")
    .select("id,metadata")
    .eq("organization_id", params.brandOrganizationId)
    .eq("module_key", "products")
    .in("id", activeSetIds.setIds);

  if (setRowsError) {
    if (isMissingShareSetFoundationError(setRowsError)) {
      return {
        foundationAvailable: false,
        allowAllGroups: false,
        allowedGroupCodes: [],
        allowedFieldCodes: [],
      };
    }
    console.error("Failed to resolve product visibility metadata:", setRowsError);
    return {
      foundationAvailable: true,
      allowAllGroups: false,
      allowedGroupCodes: [],
      allowedFieldCodes: [],
    };
  }

  let hasConfiguredPolicy = false;
  let allowAllGroups = false;
  const allowedGroupCodes = new Set<string>();
  const allowedFieldCodes = new Set<string>();

  for (const row of (setRows || []) as Array<{ metadata: unknown }>) {
    const policy = readProductVisibilityPolicyFromMetadata(row.metadata);
    if (!policy.configured) continue;
    hasConfiguredPolicy = true;
    if (policy.allowAllGroups) {
      allowAllGroups = true;
    }
    for (const code of policy.allowedGroupCodes) {
      allowedGroupCodes.add(code);
    }
    for (const code of policy.allowedFieldCodes) {
      allowedFieldCodes.add(code);
    }
  }

  if (!hasConfiguredPolicy) {
    return {
      foundationAvailable: true,
      allowAllGroups: true,
      allowedGroupCodes: [],
      allowedFieldCodes: [],
    };
  }

  if (allowAllGroups) {
    return {
      foundationAvailable: true,
      allowAllGroups: true,
      allowedGroupCodes: [],
      allowedFieldCodes: [],
    };
  }

  return {
    foundationAvailable: true,
    allowAllGroups: false,
    allowedGroupCodes: Array.from(allowedGroupCodes),
    allowedFieldCodes: Array.from(allowedFieldCodes),
  };
}

async function hasActiveBrandRelationship(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
}): Promise<boolean> {
  const { brandOrganizationId, partnerOrganizationId } = params;

  const v2 = await getSupabaseServer()
    .from("brand_partner_relationships")
    .select("id")
    .eq("brand_organization_id", brandOrganizationId)
    .eq("partner_organization_id", partnerOrganizationId)
    .eq("status", "active")
    .maybeSingle();

  if (!v2.error) {
    return Boolean(v2.data?.id);
  }

  if (!isMissingColumnError(v2.error)) {
    return false;
  }

  const v1 = await getSupabaseServer()
    .from("brand_partner_relationships")
    .select("id")
    .eq("brand_id", brandOrganizationId)
    .eq("partner_id", partnerOrganizationId)
    .eq("status", "active")
    .maybeSingle();

  if (v1.error) {
    return false;
  }

  return Boolean(v1.data?.id);
}

export async function resolvePartnerSharedBrandOrganizationIds(params: {
  partnerOrganizationId: string;
}): Promise<string[]> {
  const { partnerOrganizationId } = params;

  const v2 = await getSupabaseServer()
    .from("brand_partner_relationships")
    .select("brand_organization_id")
    .eq("partner_organization_id", partnerOrganizationId)
    .eq("status", "active");

  if (!v2.error) {
    return Array.from(
      new Set(
        ((v2.data || []) as Array<{ brand_organization_id: string | null }>)
          .map((row) => row.brand_organization_id)
          .filter((id): id is string => Boolean(id))
      )
    );
  }

  if (!isMissingColumnError(v2.error)) {
    console.error("Failed to resolve partner shared brands:", v2.error);
  } else {
    console.error("Failed to resolve partner shared brands due missing v2 columns:", v2.error);
  }
  return [];
}

async function resolveBrandMemberId(params: {
  organizationId: string;
  userId: string;
  userEmail: string | null;
}): Promise<string | null> {
  const { organizationId, userId, userEmail } = params;

  const byUser = await getSupabaseServer()
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("kinde_user_id", userId)
    .eq("status", "active")
    .limit(1);

  if (!byUser.error && Array.isArray(byUser.data) && byUser.data.length > 0) {
    return byUser.data[0].id as string;
  }

  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const byEmail = await getSupabaseServer()
    .from("organization_members")
    .select("id,kinde_user_id")
    .eq("organization_id", organizationId)
    .ilike("email", normalizedEmail)
    .eq("status", "active")
    .limit(1);

  if (byEmail.error || !Array.isArray(byEmail.data) || byEmail.data.length === 0) {
    return null;
  }

  const row = byEmail.data[0] as { id: string; kinde_user_id: string | null };
  if (row.kinde_user_id !== userId) {
    await getSupabaseServer()
      .from("organization_members")
      .update({
        kinde_user_id: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  return row.id;
}

export async function resolveTenantBrandViewContext(params: {
  request: NextRequest;
  tenantSlug: string;
  selectedBrandSlug?: string | null;
}): Promise<
  | { ok: true; context: TenantBrandViewContext }
  | { ok: false; response: NextResponse }
> {
  const { request, tenantSlug } = params;
  const selectedBrandSlug = (params.selectedBrandSlug || "").trim().toLowerCase();
  const tenantAccess = await verifyTenantAccess(request, tenantSlug);

  if (!tenantAccess.success || !tenantAccess.organization || !tenantAccess.userId) {
    return {
      ok: false,
      response: tenantAccess.error!,
    };
  }

  const { getUser } = getKindeServerSession();
  const user = await getUser();
  const userEmail = user?.email?.trim().toLowerCase() || null;

  const tenantOrganization = toOrganizationSummary(tenantAccess.organization);
  if (
    !selectedBrandSlug ||
    tenantOrganization.organizationType !== "partner" ||
    selectedBrandSlug === tenantOrganization.slug.toLowerCase()
  ) {
    return {
      ok: true,
      context: {
        userId: tenantAccess.userId,
        userEmail,
        tenantOrganization,
        targetOrganization: tenantOrganization,
        selectedBrandSlug: null,
        mode: "tenant",
        brandMemberId: null,
      },
    };
  }

  const { data: brandOrg, error: brandOrgError } = await getSupabaseServer()
    .from("organizations")
    .select("id,name,slug,organization_type")
    .eq("slug", selectedBrandSlug)
    .eq("organization_type", "brand")
    .maybeSingle();

  if (brandOrgError || !brandOrg) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Selected brand view was not found." },
        { status: 404 }
      ),
    };
  }

  const relationshipActive = await hasActiveBrandRelationship({
    brandOrganizationId: brandOrg.id,
    partnerOrganizationId: tenantOrganization.id,
  });

  if (!relationshipActive) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Selected brand is not shared with this partner workspace." },
        { status: 403 }
      ),
    };
  }

  const brandMemberId = await resolveBrandMemberId({
    organizationId: brandOrg.id,
    userId: tenantAccess.userId,
    userEmail,
  });

  const context: TenantBrandViewContext = {
    userId: tenantAccess.userId,
    userEmail,
    tenantOrganization,
    targetOrganization: {
      id: brandOrg.id,
      slug: brandOrg.slug,
      name: brandOrg.name,
      organizationType: "brand",
    },
    selectedBrandSlug: brandOrg.slug,
    mode: "partner_brand",
    brandMemberId,
  };

  if (isMutatingRequestMethod(request.method)) {
    const blocked = await blockPartnerBrandMutation({
      request,
      context,
      action: "partner_brand.mutation",
      resourceType: "organization",
      resourceId: brandOrg.id,
      metadata: {
        selected_brand_slug: brandOrg.slug,
      },
    });
    if (blocked) {
      return { ok: false, response: blocked };
    }
  }

  return {
    ok: true,
    context,
  };
}

export async function getScopedPermissionSummary(params: {
  organizationId: string;
  memberId: string;
  permissionKeys: string[];
}): Promise<ScopedPermissionSummary> {
  const { organizationId, memberId, permissionKeys } = params;
  if (permissionKeys.length === 0) {
    return {
      hasOrganizationScope: false,
      marketIds: [],
      channelIds: [],
      collectionIds: [],
    };
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await getSupabaseServer()
    .from("member_scope_permissions")
    .select("scope_type,market_id,channel_id,collection_id,expires_at")
    .eq("organization_id", organizationId)
    .eq("member_id", memberId)
    .in("permission_key", permissionKeys)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  if (error || !Array.isArray(data)) {
    return {
      hasOrganizationScope: false,
      marketIds: [],
      channelIds: [],
      collectionIds: [],
    };
  }

  let hasOrganizationScope = false;
  const marketIds = new Set<string>();
  const channelIds = new Set<string>();
  const collectionIds = new Set<string>();

  for (const row of data as Array<{
    scope_type: ScopeType;
    market_id: string | null;
    channel_id: string | null;
    collection_id: string | null;
  }>) {
    if (row.scope_type === "organization") {
      hasOrganizationScope = true;
    }
    if (row.market_id) marketIds.add(row.market_id);
    if (row.channel_id) channelIds.add(row.channel_id);
    if (row.collection_id) collectionIds.add(row.collection_id);
  }

  return {
    hasOrganizationScope,
    marketIds: Array.from(marketIds),
    channelIds: Array.from(channelIds),
    collectionIds: Array.from(collectionIds),
  };
}

function dedupeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.add(trimmed);
  }
  return Array.from(out);
}

function normalizeScopeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePartnerGrantScope(
  scope: PartnerGrantScopeSelection | null | undefined
): Required<PartnerGrantScopeSelection> {
  const destinationProfileId = normalizeScopeId(
    scope?.destinationProfileId ?? scope?.channelId
  );
  return {
    marketId: normalizeScopeId(scope?.marketId),
    channelId: destinationProfileId,
    destinationProfileId,
    localeId: normalizeScopeId(scope?.localeId),
    destinationId: normalizeScopeId(scope?.destinationId),
  };
}

function matchesScopeConstraint(
  allowedIds: unknown,
  selectedId: string | null
): boolean {
  const scopedIds = dedupeStringArray(allowedIds);
  if (scopedIds.length === 0) return true;
  if (!selectedId) return true;
  return scopedIds.includes(selectedId);
}

type PartnerShareSetItemRow = {
  resource_type: string;
  resource_id: string | null;
  include_descendants: boolean | null;
  market_ids?: string[] | null;
  channel_ids?: string[] | null;
  locale_ids?: string[] | null;
  destination_ids?: string[] | null;
};

async function loadPartnerShareSetItems(params: {
  organizationId: string;
  setIds: string[];
  resourceTypes: string[];
}): Promise<{ foundationAvailable: boolean; items: PartnerShareSetItemRow[] }> {
  const withDestinationIds = await getSupabaseServer()
    .from("share_set_items")
    .select(
    "resource_type,resource_id,include_descendants,market_ids,channel_ids,locale_ids,destination_ids"
    )
    .eq("organization_id", params.organizationId)
    .in("share_set_id", params.setIds)
    .in("resource_type", params.resourceTypes);

  if (withDestinationIds.error && isMissingColumnError(withDestinationIds.error)) {
    const withoutDestinationIds = await getSupabaseServer()
      .from("share_set_items")
      .select("resource_type,resource_id,include_descendants,market_ids,channel_ids,locale_ids")
      .eq("organization_id", params.organizationId)
      .in("share_set_id", params.setIds)
      .in("resource_type", params.resourceTypes);
    if (withoutDestinationIds.error) {
      if (isMissingShareSetFoundationError(withoutDestinationIds.error)) {
        return { foundationAvailable: false, items: [] };
      }
      console.error("Failed to resolve saved scope items:", withoutDestinationIds.error);
      return { foundationAvailable: true, items: [] };
    }
    return {
      foundationAvailable: true,
      items: (withoutDestinationIds.data || []) as PartnerShareSetItemRow[],
    };
  }

  if (withDestinationIds.error) {
    if (isMissingShareSetFoundationError(withDestinationIds.error)) {
      return { foundationAvailable: false, items: [] };
    }
    console.error("Failed to resolve saved scope items:", withDestinationIds.error);
    return { foundationAvailable: true, items: [] };
  }

  return {
    foundationAvailable: true,
    items: ((withDestinationIds.data || []) as unknown) as PartnerShareSetItemRow[],
  };
}

function applyPartnerShareItemScopeFilter(params: {
  items: PartnerShareSetItemRow[];
  scope: PartnerGrantScopeSelection | null | undefined;
}): PartnerShareSetItemRow[] {
  const scope = normalizePartnerGrantScope(params.scope);
  const destinationProfileId = scope.destinationProfileId ?? scope.channelId;
  return params.items.filter((item) => {
    if (!matchesScopeConstraint(item.market_ids, scope.marketId)) return false;
    if (!matchesScopeConstraint(item.channel_ids, destinationProfileId)) return false;
    if (!matchesScopeConstraint(item.locale_ids, scope.localeId)) return false;
    if (!matchesScopeConstraint(item.destination_ids, scope.destinationId)) return false;
    return true;
  });
}

export async function resolveCollectionAssetIds(params: {
  organizationId: string;
  collectionIds: string[];
}): Promise<string[]> {
  const { organizationId } = params;
  const collectionIds = Array.from(new Set(params.collectionIds.filter(Boolean)));
  if (collectionIds.length === 0) {
    return [];
  }

  const { data: collections, error: collectionsError } = await getSupabaseServer()
    .from("dam_collections")
    .select("id,asset_ids,folder_ids")
    .eq("organization_id", organizationId)
    .in("id", collectionIds);

  if (collectionsError || !Array.isArray(collections)) {
    return [];
  }

  const assetIds = new Set<string>();
  const rootFolderIds = new Set<string>();

  for (const collection of collections as Array<{ asset_ids?: unknown; folder_ids?: unknown }>) {
    for (const assetId of dedupeStringArray(collection.asset_ids)) {
      assetIds.add(assetId);
    }
    for (const folderId of dedupeStringArray(collection.folder_ids)) {
      rootFolderIds.add(folderId);
    }
  }

  if (rootFolderIds.size === 0) {
    return Array.from(assetIds);
  }

  const { data: rootFolders, error: rootFolderError } = await getSupabaseServer()
    .from("dam_folders")
    .select("id,path")
    .eq("organization_id", organizationId)
    .in("id", Array.from(rootFolderIds));

  if (rootFolderError) {
    return Array.from(assetIds);
  }

  const descendantFolderIds = new Set<string>();
  const folderPaths = new Set<string>();

  for (const folder of (rootFolders || []) as Array<{ id: string; path: string }>) {
    if (folder.id) descendantFolderIds.add(folder.id);
    if (folder.path) folderPaths.add(folder.path);
  }

  for (const path of folderPaths) {
    const { data: descendants } = await getSupabaseServer()
      .from("dam_folders")
      .select("id")
      .eq("organization_id", organizationId)
      .like("path", `${path}/%`);

    for (const folder of (descendants || []) as Array<{ id: string }>) {
      if (folder.id) descendantFolderIds.add(folder.id);
    }
  }

  if (descendantFolderIds.size > 0) {
    const { data: folderAssets } = await getSupabaseServer()
      .from("dam_assets")
      .select("id")
      .eq("organization_id", organizationId)
      .in("folder_id", Array.from(descendantFolderIds));

    for (const row of (folderAssets || []) as Array<{ id: string }>) {
      if (row.id) assetIds.add(row.id);
    }
  }

  return Array.from(assetIds);
}

async function resolvePartnerGrantedAssetIdsUncached(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  scope?: PartnerGrantScopeSelection;
}): Promise<PartnerGrantedAssetIdsResult> {
  const shareSets = await resolveActivePartnerShareSetIds({
    brandOrganizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId,
    moduleKey: "assets",
  });

  if (!shareSets.foundationAvailable) {
    return { foundationAvailable: false, assetIds: [] };
  }

  const assetIds = new Set<string>();

  if (shareSets.setIds.length === 0) {
    return { foundationAvailable: true, assetIds: Array.from(assetIds) };
  }

  const loadedItems = await loadPartnerShareSetItems({
    organizationId: params.brandOrganizationId,
    setIds: shareSets.setIds,
    resourceTypes: ["asset", "folder"],
  });
  if (!loadedItems.foundationAvailable) {
    return { foundationAvailable: false, assetIds: [] };
  }
  const scopedItems = applyPartnerShareItemScopeFilter({
    items: loadedItems.items,
    scope: params.scope,
  });

  const folderIdsDirect = new Set<string>();
  const folderIdsRecursive = new Set<string>();

  for (const item of scopedItems) {
    if (!item.resource_id) continue;
    if (item.resource_type === "asset") {
      assetIds.add(item.resource_id);
      continue;
    }
    if (item.resource_type !== "folder") continue;

    if (item.include_descendants) {
      folderIdsRecursive.add(item.resource_id);
    } else {
      folderIdsDirect.add(item.resource_id);
    }
  }

  if (folderIdsDirect.size > 0) {
    const { data: directAssets, error: directAssetsError } = await getSupabaseServer()
      .from("dam_assets")
      .select("id")
      .eq("organization_id", params.brandOrganizationId)
      .in("folder_id", Array.from(folderIdsDirect));

    if (!directAssetsError) {
      for (const row of (directAssets || []) as Array<{ id: string | null }>) {
        if (row.id) assetIds.add(row.id);
      }
    }
  }

  if (folderIdsRecursive.size > 0) {
    const { data: rootFolders, error: rootFoldersError } = await getSupabaseServer()
      .from("dam_folders")
      .select("id,path")
      .eq("organization_id", params.brandOrganizationId)
      .in("id", Array.from(folderIdsRecursive));

    if (!rootFoldersError) {
      const folderIds = new Set<string>();
      const rootPaths: string[] = [];

      for (const folder of (rootFolders || []) as Array<{ id: string | null; path: string | null }>) {
        if (folder.id) folderIds.add(folder.id);
        if (folder.path) rootPaths.push(folder.path);
      }

      for (const path of rootPaths) {
        const { data: descendants } = await getSupabaseServer()
          .from("dam_folders")
          .select("id")
          .eq("organization_id", params.brandOrganizationId)
          .like("path", `${path}/%`);

        for (const folder of (descendants || []) as Array<{ id: string | null }>) {
          if (folder.id) folderIds.add(folder.id);
        }
      }

      if (folderIds.size > 0) {
        const { data: folderAssets } = await getSupabaseServer()
          .from("dam_assets")
          .select("id")
          .eq("organization_id", params.brandOrganizationId)
          .in("folder_id", Array.from(folderIds));

        for (const row of (folderAssets || []) as Array<{ id: string | null }>) {
          if (row.id) assetIds.add(row.id);
        }
      }
    }
  }

  // Compatibility bridge:
  // Older backfilled sets can carry metadata.legacy_collection_id while not yet
  // having explicit share_set_items rows. Include those assets so legacy data
  // remains visible during migration rollout.
  const { data: setRows, error: setRowsError } = await getSupabaseServer()
    .from("share_sets")
    .select("id,metadata")
    .eq("organization_id", params.brandOrganizationId)
    .eq("module_key", "assets")
    .in("id", shareSets.setIds);

  if (!setRowsError && Array.isArray(setRows)) {
    const fallbackCollectionIds = new Set<string>();
    for (const row of setRows as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : null;
      const legacyCollectionId =
        metadata && typeof metadata.legacy_collection_id === "string"
          ? metadata.legacy_collection_id.trim()
          : "";
      if (legacyCollectionId) {
        fallbackCollectionIds.add(legacyCollectionId);
      }
    }

    if (fallbackCollectionIds.size > 0) {
      const legacyAssets = await resolveCollectionAssetIds({
        organizationId: params.brandOrganizationId,
        collectionIds: Array.from(fallbackCollectionIds),
      });
      for (const assetId of legacyAssets) {
        assetIds.add(assetId);
      }
    }
  }

  return { foundationAvailable: true, assetIds: Array.from(assetIds) };
}

export async function resolvePartnerGrantedAssetIds(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  scope?: PartnerGrantScopeSelection;
}): Promise<PartnerGrantedAssetIdsResult> {
  const cacheKey = buildPartnerGrantCacheKey(
    "assets",
    params.brandOrganizationId,
    params.partnerOrganizationId,
    params.scope
  );
  const now = Date.now();
  const cached = partnerGrantedAssetIdsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return clonePartnerGrantedAssetIdsResult(cached.value);
  }

  const inFlight = partnerGrantedAssetIdsInFlight.get(cacheKey);
  if (inFlight) {
    return clonePartnerGrantedAssetIdsResult(await inFlight);
  }

  const computePromise = resolvePartnerGrantedAssetIdsUncached(params)
    .then((result) => {
      partnerGrantedAssetIdsCache.set(cacheKey, {
        expiresAt: Date.now() + PARTNER_GRANT_CACHE_TTL_MS,
        value: result,
      });
      prunePartnerGrantCache(partnerGrantedAssetIdsCache);
      return result;
    })
    .finally(() => {
      partnerGrantedAssetIdsInFlight.delete(cacheKey);
    });

  partnerGrantedAssetIdsInFlight.set(cacheKey, computePromise);
  return clonePartnerGrantedAssetIdsResult(await computePromise);
}

async function resolvePartnerMarketSetIds(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  moduleKey: ShareSetModuleKey;
  scopeMarketId?: string | null;
}): Promise<string[]> {
  // Resolve markets this partner is assigned to (Tier 2 access)
  const { data: assignments, error } = await getSupabaseServer()
    .from("partner_market_assignments")
    .select("market_id,valid_from")
    .eq("organization_id", params.brandOrganizationId)
    .eq("partner_organization_id", params.partnerOrganizationId)
    .eq("is_active", true);

  if (error || !assignments) return [];

  const now = Date.now();
  const marketIds = (assignments as Array<{ market_id: string; valid_from: string | null }>)
    .filter((row) => {
      if (!row.market_id) return false;
      if (row.valid_from) {
        const validFrom = Date.parse(row.valid_from);
        if (Number.isFinite(validFrom) && validFrom > now) return false;
      }
      return true;
    })
    .map((row) => row.market_id)
    .filter(Boolean);

  if (marketIds.length === 0) return [];

  // If a specific market is requested via scope, only resolve that market
  const marketsToResolve = params.scopeMarketId
    ? marketIds.filter((id) => id === params.scopeMarketId)
    : marketIds;

  if (marketsToResolve.length === 0) return [];

  const { resolveMarketCatalogProductIds, resolveMarketCatalogAssetIds } = await import(
    "@/lib/market-catalog"
  );

  const resolver = params.moduleKey === "products"
    ? resolveMarketCatalogProductIds
    : resolveMarketCatalogAssetIds;

  const results = await Promise.all(
    marketsToResolve.map((marketId) =>
      resolver({
        organizationId: params.brandOrganizationId,
        marketId,
        ...(params.moduleKey === "products"
          ? { applyGlobalEligibilityToGlobalSets: true }
          : {}),
      })
    )
  );

  return Array.from(new Set(results.flatMap((r) => r.ids)));
}

async function resolvePartnerGrantedProductIdsUncached(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  scope?: PartnerGrantScopeSelection;
}): Promise<PartnerGrantedProductIdsResult> {
  const shareSets = await resolveActivePartnerShareSetIds({
    brandOrganizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId,
    moduleKey: "products",
  });

  if (!shareSets.foundationAvailable) {
    return { foundationAvailable: false, productIds: [] };
  }

  const productIds = new Set<string>();

  if (shareSets.setIds.length > 0) {
    const loadedItems = await loadPartnerShareSetItems({
      organizationId: params.brandOrganizationId,
      setIds: shareSets.setIds,
      resourceTypes: ["product", "variant"],
    });
    if (!loadedItems.foundationAvailable) {
      return { foundationAvailable: false, productIds: [] };
    }
    const scopedItems = applyPartnerShareItemScopeFilter({
      items: loadedItems.items,
      scope: params.scope,
    });

    const parentIdsWithDescendants = new Set<string>();
    for (const item of scopedItems) {
      if (!item.resource_id) continue;
      productIds.add(item.resource_id);
      if (item.resource_type === "product" && item.include_descendants) {
        parentIdsWithDescendants.add(item.resource_id);
      }
    }

    if (parentIdsWithDescendants.size > 0) {
      // Exclude restricted variants from auto-expansion
      const { data: descendants } = await getSupabaseServer()
        .from("products")
        .select("id")
        .eq("organization_id", params.brandOrganizationId)
        .in("parent_id", Array.from(parentIdsWithDescendants))
        .neq("catalog_visibility", "restricted");

      for (const row of (descendants || []) as Array<{ id: string | null }>) {
        if (row.id) productIds.add(row.id);
      }
    }
  }

  // Enforce restricted: block at the explicit-grant level too.
  // A restricted product must never be visible to a partner, even if explicitly in a set.
  const allIds = Array.from(productIds);
  if (allIds.length > 0) {
    const { data: restrictedRows } = await getSupabaseServer()
      .from("products")
      .select("id")
      .eq("organization_id", params.brandOrganizationId)
      .in("id", allIds)
      .eq("catalog_visibility", "restricted");

    for (const row of (restrictedRows || []) as Array<{ id: string | null }>) {
      if (row.id) productIds.delete(row.id);
    }
  }

  return { foundationAvailable: true, productIds: Array.from(productIds) };
}

export async function resolvePartnerGrantedProductIds(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  scope?: PartnerGrantScopeSelection;
}): Promise<PartnerGrantedProductIdsResult> {
  const cacheKey = buildPartnerGrantCacheKey(
    "products",
    params.brandOrganizationId,
    params.partnerOrganizationId,
    params.scope
  );
  const now = Date.now();
  const cached = partnerGrantedProductIdsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return clonePartnerGrantedProductIdsResult(cached.value);
  }

  const inFlight = partnerGrantedProductIdsInFlight.get(cacheKey);
  if (inFlight) {
    return clonePartnerGrantedProductIdsResult(await inFlight);
  }

  const computePromise = resolvePartnerGrantedProductIdsUncached(params)
    .then((result) => {
      partnerGrantedProductIdsCache.set(cacheKey, {
        expiresAt: Date.now() + PARTNER_GRANT_CACHE_TTL_MS,
        value: result,
      });
      prunePartnerGrantCache(partnerGrantedProductIdsCache);
      return result;
    })
    .finally(() => {
      partnerGrantedProductIdsInFlight.delete(cacheKey);
    });

  partnerGrantedProductIdsInFlight.set(cacheKey, computePromise);
  return clonePartnerGrantedProductIdsResult(await computePromise);
}

/**
 * Returns the legacy destination profile assigned to this partner for the given market.
 * Used by the partner product view to determine which destination profile to score readiness against.
 * Returns null if the partner has no assignment for this market, or if no profile is set.
 */
export async function resolvePartnerMarketOutputProfileId(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  marketId: string | null | undefined;
}): Promise<string | null> {
  if (!params.marketId) return null;

  const { data, error } = await getSupabaseServer()
    .from("partner_market_assignments")
    .select("output_profile_id")
    .eq("organization_id", params.brandOrganizationId)
    .eq("partner_organization_id", params.partnerOrganizationId)
    .eq("market_id", params.marketId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { output_profile_id: string | null }).output_profile_id ?? null;
}

async function resolvePartnerShareSetOutputProfileId(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
}): Promise<string | null> {
  const activeSetIds = await resolveActivePartnerShareSetIds({
    brandOrganizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId,
    moduleKey: "products",
  });

  if (!activeSetIds.foundationAvailable || activeSetIds.setIds.length === 0) {
    return null;
  }

  const { data, error } = await getSupabaseServer()
    .from("share_sets")
    .select("output_profile_id,updated_at")
    .eq("organization_id", params.brandOrganizationId)
    .eq("module_key", "products")
    .in("id", activeSetIds.setIds)
    .not("output_profile_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const row = data[0] as { output_profile_id?: string | null };
  return row.output_profile_id ?? null;
}

async function resolvePrimaryOutputProfileId(organizationId: string): Promise<string | null> {
  const { data, error } = await getSupabaseServer()
    .from("output_channel_profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { id: string | null }).id ?? null;
}

export async function resolvePartnerEffectiveOutputProfileId(params: {
  brandOrganizationId: string;
  partnerOrganizationId: string;
  marketId?: string | null;
  destinationId?: string | null;
}): Promise<string | null> {
  if (params.destinationId) {
    const { data: directGrant, error: directGrantError } = await getSupabaseServer()
      .from("partner_contract_grants")
      .select("output_profile_id")
      .eq("organization_id", params.brandOrganizationId)
      .eq("partner_organization_id", params.partnerOrganizationId)
      .eq("output_profile_id", params.destinationId)
      .eq("status", "active")
      .maybeSingle();

    if (!directGrantError && directGrant) {
      return (directGrant as { output_profile_id: string | null }).output_profile_id ?? null;
    }
  }

  const { data: contractGrants, error: contractGrantError } = await getSupabaseServer()
    .from("partner_contract_grants")
    .select("output_profile_id,updated_at")
    .eq("organization_id", params.brandOrganizationId)
    .eq("partner_organization_id", params.partnerOrganizationId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (!contractGrantError && Array.isArray(contractGrants) && contractGrants.length > 0) {
    const row = contractGrants[0] as { output_profile_id?: string | null };
    if (row.output_profile_id) return row.output_profile_id;
  }

  const shareSetProfileId = await resolvePartnerShareSetOutputProfileId({
    brandOrganizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId,
  });
  if (shareSetProfileId) return shareSetProfileId;

  const marketProfileId = await resolvePartnerMarketOutputProfileId({
    brandOrganizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId,
    marketId: params.marketId,
  });
  if (marketProfileId) return marketProfileId;

  return resolvePrimaryOutputProfileId(params.brandOrganizationId);
}

