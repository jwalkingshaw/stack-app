import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentOrganization, requireUser } from "@/lib/auth-server";
import {
  resolvePartnerSharedBrandOrganizationIds,
  resolveTenantBrandViewContext,
  type TenantBrandViewContext,
} from "@/lib/partner-brand-view";
import {
  resolvePartnerEntitlements,
  type PartnerEntitlementResult,
} from "@/lib/partner-entitlements";
import { getProductContract } from "@/lib/product-contracts";
import { listRecentPortalPublishes, type PortalPublishRecord } from "@/lib/syndication-runs";
import { rewriteStorageUrlToCloudFront, rewriteThumbnailUrls } from "@/lib/storage-url";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const PROFILE_CODE_ALIASES: Record<string, string[]> = {
  portal: ["portal-catalog", "generic_portal"],
  "portal-catalog": ["portal", "generic_portal"],
  "ecommerce-catalog": ["shopify"],
  shopify: ["ecommerce-catalog"],
  generic_portal: ["portal", "portal-catalog"],
};

function normalizeToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function isPortalLaunchProfile(profile: {
  profile_type?: unknown;
  code?: unknown;
  name?: unknown;
}): boolean {
  const profileType = String(profile.profile_type ?? "").trim().toLowerCase();
  const code = String(profile.code ?? "").trim().toLowerCase();
  const name = String(profile.name ?? "").trim().toLowerCase();
  if (profileType !== "portal") return false;
  if (!code && !name) return true;
  return (
    code === "portal" ||
    code === "portal-catalog" ||
    code === "generic_portal" ||
    name === "portal" ||
    name === "portal catalog" ||
    name === "partner portal"
  );
}

async function resolveMarketLocaleScope(params: {
  organizationId: string;
  marketId: string | null;
  localeId: string | null;
  localeCode: string | null;
}): Promise<{
  marketId: string | null;
  marketCode: string | null;
  localeId: string | null;
  localeCode: string | null;
}> {
  let marketCode: string | null = null;
  let localeId = params.localeId;
  let localeCode = params.localeCode ? params.localeCode.trim().toLowerCase() : null;

  if (!params.marketId) {
    return {
      marketId: null,
      marketCode: null,
      localeId,
      localeCode,
    };
  }

  const { data: market } = await supabase
    .from("markets")
    .select("id,code,default_locale_id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.marketId)
    .maybeSingle();

  marketCode = typeof market?.code === "string" ? market.code : null;
  const defaultLocaleId =
    typeof market?.default_locale_id === "string" ? market.default_locale_id : null;

  const { data: marketLocales } = await supabase
    .from("market_locales")
    .select("locale_id")
    .eq("market_id", params.marketId)
    .eq("is_active", true);

  const allowedLocaleIds = new Set(
    ((marketLocales || []) as Array<{ locale_id: string | null }>)
      .map((row) => row.locale_id)
      .filter((value): value is string => Boolean(value))
  );

  if (localeId) {
    if (!allowedLocaleIds.has(localeId)) {
      localeId = defaultLocaleId;
      localeCode = null;
    }
  } else if (localeCode) {
    const { data: locale } = await supabase
      .from("locales")
      .select("id,code")
      .eq("organization_id", params.organizationId)
      .eq("code", localeCode)
      .maybeSingle();
    const matchedLocaleId = typeof locale?.id === "string" ? locale.id : null;
    if (matchedLocaleId && allowedLocaleIds.has(matchedLocaleId)) {
      localeId = matchedLocaleId;
      localeCode = typeof locale?.code === "string" ? locale.code : localeCode;
    } else {
      localeId = defaultLocaleId;
      localeCode = null;
    }
  } else {
    localeId = defaultLocaleId;
  }

  if (localeId) {
    const { data: locale } = await supabase
      .from("locales")
      .select("id,code")
      .eq("organization_id", params.organizationId)
      .eq("id", localeId)
      .maybeSingle();

    localeCode = typeof locale?.code === "string" ? locale.code : localeCode;
  }

  return {
    marketId: params.marketId,
    marketCode,
    localeId: localeId ?? null,
    localeCode: localeCode ?? null,
  };
}

function parseLimit(searchParams: URLSearchParams): number {
  const raw = Number.parseInt(searchParams.get("limit") || "", 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, raw);
}

function parseOffset(searchParams: URLSearchParams, limit: number): number {
  const rawOffset = Number.parseInt(searchParams.get("offset") || "", 10);
  if (Number.isFinite(rawOffset) && rawOffset >= 0) return rawOffset;
  const page = Number.parseInt(searchParams.get("page") || "", 10);
  if (Number.isFinite(page) && page > 1) return (page - 1) * limit;
  return 0;
}

function normalizeAsset(asset: Record<string, unknown>) {
  const thumbnailUrls =
    (asset.thumbnail_urls && typeof asset.thumbnail_urls === "object" && !Array.isArray(asset.thumbnail_urls)
      ? asset.thumbnail_urls
      : asset.thumbnailUrls && typeof asset.thumbnailUrls === "object" && !Array.isArray(asset.thumbnailUrls)
        ? asset.thumbnailUrls
        : null) as Record<string, unknown> | null;

  return {
    id: String(asset.id ?? ""),
    filename: typeof asset.filename === "string" ? asset.filename : null,
    original_filename:
      typeof asset.original_filename === "string"
        ? asset.original_filename
        : typeof asset.originalFilename === "string"
          ? asset.originalFilename
          : null,
    file_type:
      typeof asset.file_type === "string"
        ? asset.file_type
        : typeof asset.fileType === "string"
          ? asset.fileType
          : null,
    mime_type:
      typeof asset.mime_type === "string"
        ? asset.mime_type
        : typeof asset.mimeType === "string"
          ? asset.mimeType
          : null,
    file_size:
      typeof asset.file_size === "number"
        ? asset.file_size
        : typeof asset.fileSize === "number"
          ? asset.fileSize
          : null,
    folder_id:
      typeof asset.folder_id === "string"
        ? asset.folder_id
        : typeof asset.folderId === "string"
          ? asset.folderId
          : null,
    description: typeof asset.description === "string" ? asset.description : null,
    alt_text: typeof asset.alt_text === "string" ? asset.alt_text : null,
    tags: toStringArray(asset.tags),
    product_identifiers: toStringArray(asset.product_identifiers ?? asset.productIdentifiers),
    asset_scope:
      typeof asset.asset_scope === "string"
        ? asset.asset_scope
        : typeof asset.assetScope === "string"
          ? asset.assetScope
          : null,
    asset_status:
      typeof asset.asset_status === "string"
        ? asset.asset_status
        : typeof asset.assetStatus === "string"
          ? asset.assetStatus
          : "active",
    updated_at:
      typeof asset.updated_at === "string"
        ? asset.updated_at
        : typeof asset.updatedAt === "string"
          ? asset.updatedAt
          : null,
    current_version_changed_at:
      typeof asset.current_version_changed_at === "string"
        ? asset.current_version_changed_at
        : typeof asset.currentVersionChangedAt === "string"
          ? asset.currentVersionChangedAt
          : null,
    delivery: {
      original_url: rewriteStorageUrlToCloudFront(
        typeof asset.s3_url === "string"
          ? asset.s3_url
          : typeof asset.s3Url === "string"
            ? asset.s3Url
            : null
      ),
      thumbnail_urls: rewriteThumbnailUrls(thumbnailUrls),
    },
  };
}

async function resolveOrganizationProfileId(params: {
  organizationId: string;
  profileToken: string | null;
  allowedProfileIds?: string[] | null;
}): Promise<string | null> {
  const token = normalizeToken(params.profileToken);
  if (!token) return null;

  if (UUID_RE.test(token)) {
    if (
      Array.isArray(params.allowedProfileIds) &&
      params.allowedProfileIds.length > 0 &&
      !params.allowedProfileIds.includes(token)
    ) {
      return null;
    }
    return token;
  }

  const profileCodes = [token, ...(PROFILE_CODE_ALIASES[token] ?? [])];
  const { data, error } = await supabase
    .from("output_channel_profiles")
    .select("id")
    .eq("organization_id", params.organizationId)
    .in("code", profileCodes)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  if (
    Array.isArray(params.allowedProfileIds) &&
    params.allowedProfileIds.length > 0 &&
    !params.allowedProfileIds.includes(data.id)
  ) {
    return null;
  }
  return data.id as string;
}

async function resolveMarketId(params: {
  organizationId: string;
  marketToken: string | null;
}): Promise<string | null> {
  const token = normalizeToken(params.marketToken);
  if (!token) return null;
  if (UUID_RE.test(token)) return token;

  const { data, error } = await supabase
    .from("markets")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("code", token)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}

async function resolveLocaleIdOrCode(params: {
  localeToken: string | null;
}): Promise<{ localeId: string | null; localeCode: string | null }> {
  const token = normalizeToken(params.localeToken);
  if (!token) return { localeId: null, localeCode: null };
  return UUID_RE.test(token)
    ? { localeId: token, localeCode: null }
    : { localeId: null, localeCode: token };
}

type PublishedBrandAccess = {
  viewerOrganization: Awaited<ReturnType<typeof getCurrentOrganization>>;
  context: TenantBrandViewContext;
  entitlements: PartnerEntitlementResult | null;
};

export async function resolvePublishedBrandAccess(params: {
  request: NextRequest;
  brandSlug: string;
}): Promise<
  | { ok: true; data: PublishedBrandAccess }
  | { ok: false; response: NextResponse }
> {
  const user = await requireUser();
  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const viewerOrganization = await getCurrentOrganization();
  if (!viewerOrganization?.slug) {
    return {
      ok: false,
      response: NextResponse.json({ error: "workspace_unavailable" }, { status: 401 }),
    };
  }

  const contextResult = await resolveTenantBrandViewContext({
    request: params.request,
    tenantSlug: viewerOrganization.slug,
    selectedBrandSlug: params.brandSlug,
  });

  if (!contextResult.ok) {
    return contextResult;
  }

  const { context } = contextResult;
  const entitlements =
    context.mode === "partner_brand"
      ? await resolvePartnerEntitlements({
          brandOrganizationId: context.targetOrganization.id,
          partnerOrganizationId: context.tenantOrganization.id,
        })
      : null;

  return {
    ok: true,
    data: {
      viewerOrganization,
      context,
      entitlements,
    },
  };
}

async function loadActiveProfiles(params: {
  organizationId: string;
  allowedProfileIds?: string[] | null;
}) {
  let query = supabase
    .from("output_channel_profiles")
    .select("id,name,code,profile_type,is_primary")
    .eq("organization_id", params.organizationId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (Array.isArray(params.allowedProfileIds) && params.allowedProfileIds.length > 0) {
    query = query.in("id", params.allowedProfileIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to load output profiles for published API:", error);
    return [];
  }

  const portalProfiles = ((data || []) as Array<Record<string, unknown>>).filter(
    isPortalLaunchProfile
  );

  return portalProfiles.map((profile) => ({
    id: String(profile.id ?? ""),
    name: "Portal",
    code: "portal",
    profileType: "portal",
    isPrimary: profile.is_primary === true,
  }));
}

async function loadLatestPublishedVersion(params: {
  brandOrganizationId: string;
  partnerOrganizationId?: string | null;
  profileId: string | null;
  marketId: string | null;
  localeId: string | null;
}): Promise<PortalPublishRecord | null> {
  const publishes = await listRecentPortalPublishes({
    organizationId: params.brandOrganizationId,
    partnerOrganizationId: params.partnerOrganizationId ?? null,
    limit: 50,
  }).catch((error) => {
    console.error("Failed to load published versions:", error);
    return [];
  });

  return (
    publishes.find((publish) => {
      if (publish.publishState !== "published") return false;
      if (params.profileId && publish.outputProfileId !== params.profileId) return false;
      if (params.marketId && publish.marketId && publish.marketId !== params.marketId) return false;
      if (params.localeId && publish.localeId && publish.localeId !== params.localeId) return false;
      return true;
    }) ?? null
  );
}

function buildPublishMeta(params: {
  profileId: string | null;
  publish: PortalPublishRecord | null;
  localeToken: string | null;
  marketToken: string | null;
  destinationToken: string | null;
}) {
  return {
    destination: params.destinationToken,
    published_at: params.publish?.publishedAt ?? null,
    publish_version:
      params.publish?.id ??
      [params.profileId ?? "default", params.localeToken ?? "default", params.marketToken ?? "default"].join(":"),
    publish_id: params.publish?.id ?? null,
  };
}

export type PublishedAssetDocument = ReturnType<typeof normalizeAsset> & {
  brand: string;
  profile: string | null;
  locale: string | null;
  market: string | null;
  destination: string | null;
  published_at: string | null;
  publish_version: string;
};

export type OutputProfileDefinition = {
  id: string;
  name: string;
  code: string;
  profileType: string;
  isPrimary: boolean;
};

function resolveSelectedProfile(
  profiles: OutputProfileDefinition[],
  profileId: string | null
): OutputProfileDefinition | null {
  if (!profileId) return profiles[0] ?? null;
  return profiles.find((profile) => profile.id === profileId) ?? null;
}

export type PortalWorkspaceBrand = {
  id: string;
  slug: string;
  name: string;
  relationship: "self" | "shared";
  profiles: OutputProfileDefinition[];
  latest_publish_at: string | null;
};

export async function buildPublishedWorkspace(request: NextRequest) {
  const user = await requireUser();
  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const currentOrganization = await getCurrentOrganization();
  if (!currentOrganization) {
    return NextResponse.json({ error: "workspace_unavailable" }, { status: 401 });
  }

  const isPartnerWorkspace =
    (currentOrganization.organizationType || currentOrganization.type || "brand") === "partner";

  const sharedBrandIds = isPartnerWorkspace
    ? await resolvePartnerSharedBrandOrganizationIds({
        partnerOrganizationId: currentOrganization.id,
      })
    : [];

  const organizationIds = isPartnerWorkspace ? sharedBrandIds : [currentOrganization.id];
  let brands: Array<Record<string, unknown>> = [];

  if (organizationIds.length > 0) {
    const { data, error } = await supabase
      .from("organizations")
      .select("id,slug,name")
      .in("id", organizationIds);
    if (error) {
      console.error("Failed to load published workspace brands:", error);
    } else {
      brands = (data || []) as Array<Record<string, unknown>>;
    }
  }

  const items: PortalWorkspaceBrand[] = [];
  for (const brand of brands) {
    const brandId = String(brand.id ?? "");
    if (!brandId) continue;
    const profiles = await loadActiveProfiles({ organizationId: brandId });
    const latestPublish = await loadLatestPublishedVersion({
      brandOrganizationId: brandId,
      partnerOrganizationId: isPartnerWorkspace ? currentOrganization.id : null,
      profileId: null,
      marketId: null,
      localeId: null,
    });

    items.push({
      id: brandId,
      slug: String(brand.slug ?? ""),
      name: String(brand.name ?? brand.slug ?? "Brand"),
      relationship: isPartnerWorkspace ? "shared" : "self",
      profiles,
      latest_publish_at: latestPublish?.publishedAt ?? null,
    });
  }

  return NextResponse.json({
    workspace: {
      id: currentOrganization.id,
      slug: currentOrganization.slug,
      name: currentOrganization.name,
      organization_type: currentOrganization.organizationType || currentOrganization.type || "brand",
    },
    brands: items.sort((left, right) => left.name.localeCompare(right.name)),
  });
}

async function loadPublishedScope(params: {
  organizationId: string;
  searchParams: URLSearchParams;
  allowedProfileIds?: string[] | null;
}) {
  const profileToken =
    normalizeToken(params.searchParams.get("profile")) ??
    normalizeToken(params.searchParams.get("profileId")) ??
    normalizeToken(params.searchParams.get("destination")) ??
    "portal";
  const marketToken =
    normalizeToken(params.searchParams.get("market")) ??
    normalizeToken(params.searchParams.get("marketId"));
  const localeToken =
    normalizeToken(params.searchParams.get("locale")) ??
    normalizeToken(params.searchParams.get("localeId"));
  const destinationToken = normalizeToken(params.searchParams.get("destination"));

  const profileId = await resolveOrganizationProfileId({
    organizationId: params.organizationId,
    profileToken,
    allowedProfileIds: params.allowedProfileIds,
  });
  const marketId = await resolveMarketId({
    organizationId: params.organizationId,
    marketToken,
  });
  const rawLocale = await resolveLocaleIdOrCode({
    localeToken,
  });
  const localeScope = await resolveMarketLocaleScope({
    organizationId: params.organizationId,
    marketId,
    localeId: rawLocale.localeId,
    localeCode: rawLocale.localeCode,
  });

  return {
    profileId,
    marketId: localeScope.marketId,
    marketToken: localeScope.marketCode ?? marketToken,
    localeId: localeScope.localeId,
    localeCode: localeScope.localeCode,
    localeToken: localeScope.localeCode ?? localeToken,
    destinationToken,
  };
}

async function loadPublishedProductRows(params: {
  organizationId: string;
  productIds: string[] | null;
  updatedSince: string | null;
  limit: number;
  offset: number;
}) {
  let countQuery = supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", params.organizationId);

  let query = supabase
    .from("products")
    .select("id,scin,sku,product_name,status,updated_at,primary_image_url")
    .eq("organization_id", params.organizationId)
    .order("updated_at", { ascending: false });

  if (Array.isArray(params.productIds)) {
    if (params.productIds.length === 0) return { rows: [], totalCount: 0 };
    countQuery = countQuery.in("id", params.productIds);
    query = query.in("id", params.productIds);
  }

  if (params.updatedSince) {
    countQuery = countQuery.gte("updated_at", params.updatedSince);
    query = query.gte("updated_at", params.updatedSince);
  }

  const [{ count, error: countError }, { data, error }] = await Promise.all([
    countQuery,
    query.range(params.offset, params.offset + params.limit - 1),
  ]);
  if (countError) {
    console.error("Failed to count published product rows:", countError);
  }
  if (error) {
    console.error("Failed to load published product rows:", error);
    return { rows: [], totalCount: 0 };
  }

  return {
    rows: (data || []) as Array<Record<string, unknown>>,
    totalCount: typeof count === "number" ? count : 0,
  };
}

export async function buildPublishedCatalog(params: {
  request: NextRequest;
  brandSlug: string;
}) {
  const accessResult = await resolvePublishedBrandAccess(params);
  if (!accessResult.ok) return accessResult.response;

  const { context, entitlements } = accessResult.data;
  const limit = parseLimit(params.request.nextUrl.searchParams);
  const offset = parseOffset(params.request.nextUrl.searchParams, limit);
  const allowedProfileIds = entitlements?.destinations.map((destination) => destination.id) ?? null;
  const scope = await loadPublishedScope({
    organizationId: context.targetOrganization.id,
    searchParams: params.request.nextUrl.searchParams,
    allowedProfileIds,
  });

  const activeProfiles = await loadActiveProfiles({
    organizationId: context.targetOrganization.id,
    allowedProfileIds,
  });
  const selectedProfileId = scope.profileId ?? activeProfiles[0]?.id ?? null;
  const selectedProfile = resolveSelectedProfile(activeProfiles, selectedProfileId);

  const publish = await loadLatestPublishedVersion({
    brandOrganizationId: context.targetOrganization.id,
    partnerOrganizationId: context.mode === "partner_brand" ? context.tenantOrganization.id : null,
    profileId: selectedProfileId,
    marketId: scope.marketId,
    localeId: scope.localeId,
  });

  const publishMeta = buildPublishMeta({
    profileId: selectedProfileId,
    publish,
    localeToken: scope.localeToken,
    marketToken: scope.marketToken,
    destinationToken: scope.destinationToken,
  });

  const { rows: productRows, totalCount } = await loadPublishedProductRows({
    organizationId: context.targetOrganization.id,
    productIds: entitlements?.productIds ?? null,
    updatedSince: normalizeToken(params.request.nextUrl.searchParams.get("updated_since")),
    limit,
    offset,
  });

  const products = productRows.map((row) => ({
    id: String(row.id ?? ""),
    scin: typeof row.scin === "string" ? row.scin : null,
    sku: typeof row.sku === "string" ? row.sku : null,
    product_name: typeof row.product_name === "string" ? row.product_name : null,
    status: typeof row.status === "string" ? row.status : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    primary_image_url: rewriteStorageUrlToCloudFront(
      typeof row.primary_image_url === "string" ? row.primary_image_url : null
    ),
    brand: context.targetOrganization.slug,
    profile: selectedProfile?.code ?? null,
    profile_id: selectedProfileId,
    locale: scope.localeToken,
    market: scope.marketToken,
    destination: scope.destinationToken,
    published_at: publishMeta.published_at,
    publish_version: publishMeta.publish_version,
  }));

  return NextResponse.json({
    brand: {
      id: context.targetOrganization.id,
      slug: context.targetOrganization.slug,
      name: context.targetOrganization.name,
    },
    profile: selectedProfile?.code ?? null,
    profile_id: selectedProfileId,
    locale: scope.localeToken,
    market: scope.marketToken,
    destination: scope.destinationToken,
    published_at: publishMeta.published_at,
    publish_version: publishMeta.publish_version,
    products,
    pagination: {
      limit,
      offset,
      count: products.length,
      total_count: totalCount,
      has_more: products.length === limit,
    },
  });
}

async function loadProductByKey(params: {
  organizationId: string;
  productKey: string;
}) {
  const token = normalizeToken(params.productKey);
  if (!token) return null;

  let query = supabase
    .from("products")
    .select("id,scin,sku,product_name,status,family_id,updated_at")
    .eq("organization_id", params.organizationId);

  if (UUID_RE.test(token)) {
    query = query.eq("id", token);
  } else {
    query = query.or(`scin.eq.${token},sku.eq.${token}`);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

export async function buildPublishedProduct(params: {
  request: NextRequest;
  brandSlug: string;
  productKey: string;
}) {
  const accessResult = await resolvePublishedBrandAccess({
    request: params.request,
    brandSlug: params.brandSlug,
  });
  if (!accessResult.ok) return accessResult.response;

  const { context, entitlements } = accessResult.data;
  const allowedProfileIds = entitlements?.destinations.map((destination) => destination.id) ?? null;
  const scope = await loadPublishedScope({
    organizationId: context.targetOrganization.id,
    searchParams: params.request.nextUrl.searchParams,
    allowedProfileIds,
  });
  const activeProfiles = await loadActiveProfiles({
    organizationId: context.targetOrganization.id,
    allowedProfileIds,
  });
  const selectedProfileId = scope.profileId ?? activeProfiles[0]?.id ?? null;
  const selectedProfile = resolveSelectedProfile(activeProfiles, selectedProfileId);

  const product = await loadProductByKey({
    organizationId: context.targetOrganization.id,
    productKey: params.productKey,
  });

  if (!product?.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (entitlements && !entitlements.productIds.includes(String(product.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const contract = await getProductContract({
    supabase: supabase as never,
    organizationId: context.targetOrganization.id,
    productId: String(product.id),
    outputProfileId: selectedProfileId,
    scope: {
      marketId: scope.marketId,
      localeId: scope.localeId,
      localeCode: scope.localeCode,
      destinationId: normalizeToken(params.request.nextUrl.searchParams.get("destinationId")),
      partnerOrganizationId: context.mode === "partner_brand" ? context.tenantOrganization.id : null,
    },
  });

  const publish = await loadLatestPublishedVersion({
    brandOrganizationId: context.targetOrganization.id,
    partnerOrganizationId: context.mode === "partner_brand" ? context.tenantOrganization.id : null,
    profileId: selectedProfileId,
    marketId: scope.marketId,
    localeId: scope.localeId,
  });
  const publishMeta = buildPublishMeta({
    profileId: selectedProfileId,
    publish,
    localeToken: scope.localeToken,
    marketToken: scope.marketToken,
    destinationToken: scope.destinationToken,
  });

  const baseFields = Object.fromEntries(
    contract.baseFields.map((field) => [field.code, field.value] as const)
  );
  const outputFields = Object.fromEntries(
    contract.outputFields.map((field) => [field.code, field.value] as const)
  );
  const attributes = Object.fromEntries(
    contract.attributeMappings.map((mapping) => [mapping.attributeCode, mapping.value] as const)
  );
  const assetSlots: PublishedAssetDocument[] = contract.slotRequirements
    .filter((slot) => slot.assignedAsset)
    .map((slot) => ({
      ...normalizeAsset(asRecord(slot.assignedAsset) || {}),
      brand: context.targetOrganization.slug,
      profile: selectedProfile?.code ?? null,
      locale: scope.localeToken,
      market: scope.marketToken,
      destination: scope.destinationToken,
      published_at: publishMeta.published_at,
      publish_version: publishMeta.publish_version,
    }));

  return NextResponse.json({
    brand: {
      id: context.targetOrganization.id,
      slug: context.targetOrganization.slug,
      name: context.targetOrganization.name,
    },
    product: {
      id: String(product.id),
      scin: typeof product.scin === "string" ? product.scin : null,
      sku: typeof product.sku === "string" ? product.sku : null,
      product_name: typeof product.product_name === "string" ? product.product_name : null,
      status: typeof product.status === "string" ? product.status : null,
      family_id: typeof product.family_id === "string" ? product.family_id : null,
      brand: context.targetOrganization.slug,
      profile: selectedProfile?.code ?? null,
      profile_id: selectedProfileId,
      locale: scope.localeToken,
      market: scope.marketToken,
      destination: scope.destinationToken,
      published_at: publishMeta.published_at,
      publish_version: publishMeta.publish_version,
      base_fields: baseFields,
      output_fields: outputFields,
      attributes,
      asset_slots: assetSlots,
      partner_documents: contract.partnerDocuments,
      missing_requirements: contract.missingRequirements,
    },
  });
}

async function loadPublishedAssets(params: {
  organizationId: string;
  assetIds: string[] | null;
  updatedSince: string | null;
  limit: number;
  offset: number;
}) {
  let countQuery = supabase
    .from("dam_assets")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", params.organizationId);

  let query = supabase
    .from("dam_assets")
    .select(
      "id,filename,original_filename,file_type,mime_type,file_size,folder_id,s3_url,thumbnail_urls,description,alt_text,tags,product_identifiers,asset_scope,asset_status,updated_at,current_version_changed_at"
    )
    .eq("organization_id", params.organizationId)
    .order("updated_at", { ascending: false });

  if (Array.isArray(params.assetIds)) {
    if (params.assetIds.length === 0) return { rows: [], totalCount: 0 };
    countQuery = countQuery.in("id", params.assetIds);
    query = query.in("id", params.assetIds);
  }

  if (params.updatedSince) {
    countQuery = countQuery.gte("updated_at", params.updatedSince);
    query = query.gte("updated_at", params.updatedSince);
  }

  const [{ count, error: countError }, { data, error }] = await Promise.all([
    countQuery,
    query.range(params.offset, params.offset + params.limit - 1),
  ]);
  if (countError) {
    console.error("Failed to count published assets:", countError);
  }
  if (error) {
    console.error("Failed to load published assets:", error);
    return { rows: [], totalCount: 0 };
  }
  return {
    rows: (data || []) as Array<Record<string, unknown>>,
    totalCount: typeof count === "number" ? count : 0,
  };
}

export async function buildPublishedAssets(params: {
  request: NextRequest;
  brandSlug: string;
}) {
  const accessResult = await resolvePublishedBrandAccess({
    request: params.request,
    brandSlug: params.brandSlug,
  });
  if (!accessResult.ok) return accessResult.response;

  const { context, entitlements } = accessResult.data;
  const limit = parseLimit(params.request.nextUrl.searchParams);
  const offset = parseOffset(params.request.nextUrl.searchParams, limit);
  const allowedProfileIds = entitlements?.destinations.map((destination) => destination.id) ?? null;
  const scope = await loadPublishedScope({
    organizationId: context.targetOrganization.id,
    searchParams: params.request.nextUrl.searchParams,
    allowedProfileIds,
  });
  const activeProfiles = await loadActiveProfiles({
    organizationId: context.targetOrganization.id,
    allowedProfileIds,
  });
  const selectedProfileId = scope.profileId ?? activeProfiles[0]?.id ?? null;
  const selectedProfile = resolveSelectedProfile(activeProfiles, selectedProfileId);

  const publish = await loadLatestPublishedVersion({
    brandOrganizationId: context.targetOrganization.id,
    partnerOrganizationId: context.mode === "partner_brand" ? context.tenantOrganization.id : null,
    profileId: selectedProfileId,
    marketId: scope.marketId,
    localeId: scope.localeId,
  });
  const publishMeta = buildPublishMeta({
    profileId: selectedProfileId,
    publish,
    localeToken: scope.localeToken,
    marketToken: scope.marketToken,
    destinationToken: scope.destinationToken,
  });

  const { rows: assets, totalCount } = await loadPublishedAssets({
    organizationId: context.targetOrganization.id,
    assetIds: entitlements?.assetIds ?? null,
    updatedSince: normalizeToken(params.request.nextUrl.searchParams.get("updated_since")),
    limit,
    offset,
  });

  return NextResponse.json({
    brand: {
      id: context.targetOrganization.id,
      slug: context.targetOrganization.slug,
      name: context.targetOrganization.name,
    },
    profile: selectedProfile?.code ?? null,
    profile_id: selectedProfileId,
    locale: scope.localeToken,
    market: scope.marketToken,
    destination: scope.destinationToken,
    published_at: publishMeta.published_at,
    publish_version: publishMeta.publish_version,
    assets: assets.map((asset) => ({
      ...normalizeAsset(asset),
      brand: context.targetOrganization.slug,
      profile: selectedProfile?.code ?? null,
      locale: scope.localeToken,
      market: scope.marketToken,
      destination: scope.destinationToken,
      published_at: publishMeta.published_at,
      publish_version: publishMeta.publish_version,
    })),
    pagination: {
      limit,
      offset,
      count: assets.length,
      total_count: totalCount,
      has_more: assets.length === limit,
    },
  });
}

export async function buildPublishedAssetDetail(params: {
  request: NextRequest;
  brandSlug: string;
  assetId: string;
}) {
  const accessResult = await resolvePublishedBrandAccess({
    request: params.request,
    brandSlug: params.brandSlug,
  });
  if (!accessResult.ok) return accessResult.response;

  const { context, entitlements } = accessResult.data;
  if (entitlements && !entitlements.assetIds.includes(params.assetId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const allowedProfileIds = entitlements?.destinations.map((destination) => destination.id) ?? null;
  const scope = await loadPublishedScope({
    organizationId: context.targetOrganization.id,
    searchParams: params.request.nextUrl.searchParams,
    allowedProfileIds,
  });
  const activeProfiles = await loadActiveProfiles({
    organizationId: context.targetOrganization.id,
    allowedProfileIds,
  });
  const selectedProfileId = scope.profileId ?? activeProfiles[0]?.id ?? null;
  const selectedProfile = resolveSelectedProfile(activeProfiles, selectedProfileId);
  const publish = await loadLatestPublishedVersion({
    brandOrganizationId: context.targetOrganization.id,
    partnerOrganizationId: context.mode === "partner_brand" ? context.tenantOrganization.id : null,
    profileId: selectedProfileId,
    marketId: scope.marketId,
    localeId: scope.localeId,
  });
  const publishMeta = buildPublishMeta({
    profileId: selectedProfileId,
    publish,
    localeToken: scope.localeToken,
    marketToken: scope.marketToken,
    destinationToken: scope.destinationToken,
  });

  const { data, error } = await supabase
    .from("dam_assets")
    .select(
      "id,filename,original_filename,file_type,mime_type,file_size,folder_id,s3_url,thumbnail_urls,description,alt_text,tags,product_identifiers,asset_scope,asset_status,updated_at,current_version_changed_at"
    )
    .eq("organization_id", context.targetOrganization.id)
    .eq("id", params.assetId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    brand: {
      id: context.targetOrganization.id,
      slug: context.targetOrganization.slug,
      name: context.targetOrganization.name,
    },
    asset: {
      ...normalizeAsset(data as Record<string, unknown>),
      brand: context.targetOrganization.slug,
      profile: selectedProfile?.code ?? null,
      profile_id: selectedProfileId,
      locale: scope.localeToken,
      market: scope.marketToken,
      destination: scope.destinationToken,
      published_at: publishMeta.published_at,
      publish_version: publishMeta.publish_version,
    },
  });
}

export async function buildPublishedPublishDetail(params: {
  request: NextRequest;
  brandSlug: string;
  publishId: string;
}) {
  const accessResult = await resolvePublishedBrandAccess({
    request: params.request,
    brandSlug: params.brandSlug,
  });
  if (!accessResult.ok) return accessResult.response;

  const { context } = accessResult.data;
  const publishes = await listRecentPortalPublishes({
    organizationId: context.targetOrganization.id,
    partnerOrganizationId: context.mode === "partner_brand" ? context.tenantOrganization.id : null,
    limit: 100,
  }).catch(() => []);
  const activeProfiles = await loadActiveProfiles({
    organizationId: context.targetOrganization.id,
  });

  const publish = publishes.find((candidate) => candidate.id === params.publishId) ?? null;
  if (!publish) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const selectedProfile =
    activeProfiles.find((profile) => profile.id === publish.outputProfileId) ?? null;

  return NextResponse.json({
    brand: {
      id: context.targetOrganization.id,
      slug: context.targetOrganization.slug,
      name: context.targetOrganization.name,
    },
    publish: {
      id: publish.id,
      profile: selectedProfile?.code ?? null,
      output_profile_id: publish.outputProfileId,
      market_id: publish.marketId,
      locale_id: publish.localeId,
      destination: asRecord(publish.scopeMetadata)?.destination ?? null,
      publish_state: publish.publishState,
      published_at: publish.publishedAt,
      publish_version: publish.id,
      readiness_snapshot: publish.readinessSnapshot,
      scope_metadata: publish.scopeMetadata,
      metadata: publish.metadata,
    },
  });
}

export async function buildPublishedUpdates(params: {
  request: NextRequest;
  brandSlug: string;
}) {
  const accessResult = await resolvePublishedBrandAccess({
    request: params.request,
    brandSlug: params.brandSlug,
  });
  if (!accessResult.ok) return accessResult.response;

  const { context } = accessResult.data;
  const publishes = await listRecentPortalPublishes({
    organizationId: context.targetOrganization.id,
    partnerOrganizationId: context.mode === "partner_brand" ? context.tenantOrganization.id : null,
    limit: 20,
  }).catch(() => []);
  const activeProfiles = await loadActiveProfiles({
    organizationId: context.targetOrganization.id,
  });

  return NextResponse.json({
    brand: {
      id: context.targetOrganization.id,
      slug: context.targetOrganization.slug,
      name: context.targetOrganization.name,
    },
    updates: publishes
      .filter((publish) => publish.publishState === "published")
      .map((publish) => ({
        id: publish.id,
        profile:
          activeProfiles.find((profile) => profile.id === publish.outputProfileId)?.code ?? null,
        output_profile_id: publish.outputProfileId,
        market_id: publish.marketId,
        locale_id: publish.localeId,
        destination: asRecord(publish.scopeMetadata)?.destination ?? null,
        published_at: publish.publishedAt,
        publish_state: publish.publishState,
        publish_version: publish.id,
        readiness_snapshot: publish.readinessSnapshot,
      })),
  });
}
