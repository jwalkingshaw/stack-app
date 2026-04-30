import { NextRequest, NextResponse } from "next/server";
import { DatabaseQueries } from "@stack-app/database";
import { getSupabaseServer } from "@/lib/supabase";
import {
  ASSET_VIEW_PERMISSION_KEYS,
  getScopedPermissionSummary,
  resolvePartnerGrantedAssetIds,
  resolvePartnerSharedBrandOrganizationIds,
  resolveCollectionAssetIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";
import { resolvePartnerEntitlements } from "@/lib/partner-entitlements";
import { normalizeDamAssetRecord, normalizeDamEnumValue } from "@/lib/dam-enums";
import { resolveMarketCatalogAssetIds } from "@/lib/market-catalog";
import { cache as redisCache, CacheKeys } from "@/lib/redis";
import { rewriteStorageUrlToCloudFront, rewriteThumbnailUrls } from "@/lib/storage-url";

const DEFAULT_PERMISSIONS = {
  role: "viewer",
  can_download_assets: true,
  can_edit_products: false,
  can_manage_team: false,
  is_owner: false,
  is_admin: false,
  is_partner: false,
};

type LooseAsset = {
  id: string;
  createdAt?: string | null;
  created_at?: string | null;
  currentVersionChangedAt?: string | null;
  current_version_changed_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  folderId?: string | null;
  folder_id?: string | null;
  assetScope?: string | null;
  tenant_owned?: boolean;
};

type RecencyAssetLike = {
  createdAt?: string | null;
  created_at?: string | null;
  currentVersionChangedAt?: string | null;
  current_version_changed_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
};
type ListPagination = {
  limit: number;
  offset: number;
  enabled: boolean;
};

const DEFAULT_LIST_LIMIT = 250;
const MAX_LIST_LIMIT = 2000;
const LIST_CACHE_TTL_SECONDS = 60;
type AssetFieldMode = "full" | "lite";

function emptyPartnerAssetsResponse(context: {
  mode: "tenant" | "partner_brand";
  selectedBrandSlug: string | null;
  tenantSlug: string;
}) {
  return NextResponse.json({
    data: {
      assets: [],
      folders: [],
      tags: [],
      categories: [],
      permissions: {
        ...DEFAULT_PERMISSIONS,
        role: "partner",
        is_partner: true,
      },
      view: {
        mode: context.mode,
        selectedBrandSlug: context.selectedBrandSlug,
        tenantSlug: context.tenantSlug,
      },
    },
  });
}

function parseIsoDateParam(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseCsvIds(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeToken(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAssetDeliveryUrls<T extends Record<string, any>>(asset: T): T {
  const normalizedAsset = { ...asset } as Record<string, any>;
  const thumbValue =
    (asset.thumbnailUrls && typeof asset.thumbnailUrls === "object" && !Array.isArray(asset.thumbnailUrls)
      ? asset.thumbnailUrls
      : asset.thumbnail_urls && typeof asset.thumbnail_urls === "object" && !Array.isArray(asset.thumbnail_urls)
        ? asset.thumbnail_urls
        : null) as Record<string, unknown> | null;

  if (typeof asset.s3Url === "string") {
    normalizedAsset.s3Url = rewriteStorageUrlToCloudFront(asset.s3Url);
  }
  if (typeof asset.s3_url === "string") {
    normalizedAsset.s3_url = rewriteStorageUrlToCloudFront(asset.s3_url);
  }

  if (thumbValue) {
    const normalizedThumbs = rewriteThumbnailUrls(thumbValue) ?? {};
    if (Object.prototype.hasOwnProperty.call(asset, "thumbnailUrls")) {
      normalizedAsset.thumbnailUrls = normalizedThumbs;
    }
    if (Object.prototype.hasOwnProperty.call(asset, "thumbnail_urls")) {
      normalizedAsset.thumbnail_urls = normalizedThumbs;
    }
  }

  return normalizedAsset as T;
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseListPagination(searchParams: URLSearchParams): ListPagination {
  const rawLimit = parsePositiveInt(searchParams.get("limit"));
  const rawOffset = parsePositiveInt(searchParams.get("offset"));
  const rawPage = parsePositiveInt(searchParams.get("page"));

  const enabled = rawLimit !== null || rawOffset !== null || rawPage !== null;
  if (!enabled) {
    return {
      limit: 0,
      offset: 0,
      enabled: false,
    };
  }

  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, rawLimit ?? DEFAULT_LIST_LIMIT));
  const pageOffset = rawPage ? Math.max(0, (rawPage - 1) * limit) : 0;
  const offset = Math.max(0, (rawOffset ?? pageOffset) || 0);

  return {
    limit,
    offset,
    enabled: true,
  };
}

function normalizeSearchQuery(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function scoreSearchToken(value: string, query: string): number {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 0;
  if (normalized === query) return 120;
  if (normalized.startsWith(query)) return 80;
  const containsIndex = normalized.indexOf(query);
  if (containsIndex >= 0) {
    return Math.max(20, 60 - containsIndex);
  }
  return 0;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function filterAssetsBySearch<T extends Record<string, any>>(
  assets: T[],
  query: string | null
): T[] {
  if (!query) return assets;

  const ranked = assets
    .map((asset) => {
      const filename =
        (typeof asset.originalFilename === "string" && asset.originalFilename) ||
        (typeof asset.original_filename === "string" && asset.original_filename) ||
        (typeof asset.filename === "string" && asset.filename) ||
        "";
      const description = typeof asset.description === "string" ? asset.description : "";
      const fileType =
        (typeof asset.fileType === "string" && asset.fileType) ||
        (typeof asset.file_type === "string" && asset.file_type) ||
        "";
      const id = typeof asset.id === "string" ? asset.id : "";
      const tags = toStringArray(asset.tags);
      const productIdentifiers = toStringArray(
        asset.productIdentifiers ?? asset.product_identifiers
      );

      let score = 0;
      score = Math.max(score, scoreSearchToken(filename, query) + 30);
      score = Math.max(score, scoreSearchToken(description, query) + 10);
      score = Math.max(score, scoreSearchToken(fileType, query) + 5);
      score = Math.max(score, scoreSearchToken(id, query));
      for (const tag of tags) {
        score = Math.max(score, scoreSearchToken(tag, query) + 8);
      }
      for (const productIdentifier of productIdentifiers) {
        score = Math.max(score, scoreSearchToken(productIdentifier, query) + 6);
      }

      const updatedAt = new Date(
        String(
          asset.currentVersionChangedAt ||
            asset.current_version_changed_at ||
            asset.updatedAt ||
            asset.updated_at ||
            asset.createdAt ||
            asset.created_at ||
            0
        )
      ).getTime();

      return { asset, score, updatedAt };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);

  return ranked.map((row) => row.asset);
}

function paginateRows<T>(rows: T[], pagination: ListPagination) {
  if (!pagination.enabled) {
    return {
      rows,
      meta: {
        enabled: false,
        total: rows.length,
      },
    };
  }

  const start = Math.min(rows.length, pagination.offset);
  const end = Math.min(rows.length, start + pagination.limit);
  return {
    rows: rows.slice(start, end),
    meta: {
      enabled: true,
      limit: pagination.limit,
      offset: pagination.offset,
      total: rows.length,
      hasMore: end < rows.length,
    },
  };
}

function selectAssetFields<T extends Record<string, any>>(asset: T, mode: AssetFieldMode): Record<string, any> {
  if (mode !== "lite") return asset;
  return {
    id: asset.id,
    organizationId: asset.organizationId ?? asset.organization_id ?? null,
    folderId: asset.folderId ?? asset.folder_id ?? null,
    filename: asset.filename ?? asset.original_filename ?? null,
    originalFilename: asset.originalFilename ?? asset.original_filename ?? null,
    fileType: asset.fileType ?? asset.file_type ?? null,
    mimeType: asset.mimeType ?? asset.mime_type ?? null,
    fileSize: asset.fileSize ?? asset.file_size ?? null,
    s3Key: asset.s3Key ?? asset.s3_key ?? null,
    s3Url: asset.s3Url ?? asset.s3_url ?? null,
    description: asset.description ?? null,
    tags: asset.tags ?? [],
    productIdentifiers: asset.productIdentifiers ?? asset.product_identifiers ?? [],
    thumbnailUrls: asset.thumbnailUrls ?? asset.thumbnail_urls ?? null,
    assetScope: asset.assetScope ?? asset.asset_scope ?? null,
    assetStatus: asset.assetStatus ?? asset.asset_status ?? "active",
    updatedAt: asset.updatedAt ?? asset.updated_at ?? null,
    currentVersionChangedAt:
      asset.currentVersionChangedAt ?? asset.current_version_changed_at ?? null,
  };
}

function filterAssetsByRecency<T extends RecencyAssetLike>(params: {
  assets: T[];
  createdAfter: Date | null;
  updatedAfter: Date | null;
}): T[] {
  const { assets, createdAfter, updatedAfter } = params;
  return assets.filter((asset) => {
    if (createdAfter) {
      const createdAtValue = new Date(asset.createdAt || asset.created_at || 0);
      if (Number.isNaN(createdAtValue.getTime()) || createdAtValue < createdAfter) {
        return false;
      }
    }

    if (updatedAfter) {
      const updatedValue = new Date(
        asset.currentVersionChangedAt ||
          asset.current_version_changed_at ||
          asset.updatedAt ||
          asset.updated_at ||
          asset.createdAt ||
          asset.created_at ||
          0
      );
      if (Number.isNaN(updatedValue.getTime()) || updatedValue < updatedAfter) {
        return false;
      }
    }

    return true;
  });
}

type StructuredFieldFilters = {
  fileType: string | null;
  assetStatus: string | null;
  complianceStatus: string | null;
  brandLegalApproval: string | null;
  artworkType: string | null;
  printVsDigital: string | null;
  wadaRiskLevel: string | null;
  athleteNames: string[];
  certifications: string[];
  regulatoryRegion: string[];
  expiringBefore: Date | null;
};

function filterAssetsByStructuredFields<T extends Record<string, any>>(
  assets: T[],
  filters: StructuredFieldFilters
): T[] {
  const {
    fileType, assetStatus, complianceStatus, brandLegalApproval,
    artworkType, printVsDigital, wadaRiskLevel, athleteNames,
    certifications, regulatoryRegion, expiringBefore,
  } = filters;

  if (
    !fileType && !assetStatus && !complianceStatus && !brandLegalApproval &&
    !artworkType && !printVsDigital && !wadaRiskLevel &&
    athleteNames.length === 0 && certifications.length === 0 &&
    regulatoryRegion.length === 0 && !expiringBefore
  ) {
    return assets;
  }

  return assets.filter((asset) => {
    if (fileType && (asset.fileType ?? asset.file_type) !== fileType) return false;
    if (assetStatus && (asset.assetStatus ?? asset.asset_status ?? "active") !== assetStatus) return false;
    if (complianceStatus && (asset.complianceStatus ?? asset.compliance_status) !== complianceStatus) return false;
    if (brandLegalApproval && (asset.brandLegalApproval ?? asset.brand_legal_approval) !== brandLegalApproval) return false;
    if (artworkType && (asset.artworkType ?? asset.artwork_type) !== artworkType) return false;
    if (printVsDigital && (asset.printVsDigital ?? asset.print_vs_digital ?? "digital") !== printVsDigital) return false;
    if (wadaRiskLevel && (asset.wadaRiskLevel ?? asset.wada_risk_level ?? "none") !== wadaRiskLevel) return false;
    if (athleteNames.length > 0) {
      const assetAthletes: string[] = asset.athleteNames ?? asset.athlete_names ?? [];
      if (!athleteNames.some((n) => assetAthletes.includes(n))) return false;
    }
    if (certifications.length > 0) {
      const assetCerts: string[] = asset.certifications ?? [];
      if (!certifications.some((c) => assetCerts.includes(c))) return false;
    }
    if (regulatoryRegion.length > 0) {
      const assetRegions: string[] = asset.regulatoryRegion ?? asset.regulatory_region ?? [];
      if (!regulatoryRegion.some((r) => assetRegions.includes(r))) return false;
    }
    if (expiringBefore) {
      const end = asset.usageEnd ?? asset.usage_end ?? asset.expirationDate ?? asset.expiration_date ?? null;
      if (!end) return false;
      const endDate = new Date(end);
      if (Number.isNaN(endDate.getTime()) || endDate >= expiringBefore) return false;
    }
    return true;
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const requestUrl = new URL(request.url);
    const selectedBrandSlug = requestUrl.searchParams.get("brand");
    const selectedMarketId = normalizeToken(requestUrl.searchParams.get("marketId"));
    const selectedChannelId = normalizeToken(requestUrl.searchParams.get("channelId"));
    const selectedLocaleId = normalizeToken(requestUrl.searchParams.get("localeId"));
    const selectedDestinationId = normalizeToken(requestUrl.searchParams.get("destinationId"));
    const requestedViewScope = (requestUrl.searchParams.get("view") || "")
      .trim()
      .toLowerCase();
    const selectedFolderId = requestUrl.searchParams.get("folderId");
    const selectedProductIds = Array.from(
      new Set([
        ...parseCsvIds(requestUrl.searchParams.get("productIds")),
        ...parseCsvIds(requestUrl.searchParams.get("productId")),
      ])
    );
    const createdAfter = parseIsoDateParam(requestUrl.searchParams.get("createdAfter"));
    const updatedAfter = parseIsoDateParam(requestUrl.searchParams.get("updatedAfter"));
    // New structured field filters
    const filterFileType = normalizeToken(requestUrl.searchParams.get("fileType"));
    const filterAssetStatus =
      normalizeDamEnumValue("assetStatus", requestUrl.searchParams.get("assetStatus")) ??
      normalizeToken(requestUrl.searchParams.get("assetStatus"));
    const filterComplianceStatus =
      normalizeDamEnumValue("complianceStatus", requestUrl.searchParams.get("complianceStatus")) ??
      normalizeToken(requestUrl.searchParams.get("complianceStatus"));
    const filterBrandLegalApproval =
      normalizeDamEnumValue("brandLegalApproval", requestUrl.searchParams.get("brandLegalApproval")) ??
      normalizeToken(requestUrl.searchParams.get("brandLegalApproval"));
    const filterArtworkType =
      normalizeDamEnumValue("artworkType", requestUrl.searchParams.get("artworkType")) ??
      normalizeToken(requestUrl.searchParams.get("artworkType"));
    const filterPrintVsDigital =
      normalizeDamEnumValue("printVsDigital", requestUrl.searchParams.get("printVsDigital")) ??
      normalizeToken(requestUrl.searchParams.get("printVsDigital"));
    const filterWadaRiskLevel =
      normalizeDamEnumValue("wadaRiskLevel", requestUrl.searchParams.get("wadaRiskLevel")) ??
      normalizeToken(requestUrl.searchParams.get("wadaRiskLevel"));
    const filterAthleteNames = parseCsvIds(requestUrl.searchParams.get("athleteNames"));
    const filterCertifications = parseCsvIds(requestUrl.searchParams.get("certifications"));
    const filterRegulatoryRegion = parseCsvIds(requestUrl.searchParams.get("regulatoryRegion"));
    const filterExpiringBefore = parseIsoDateParam(requestUrl.searchParams.get("expiringBefore"));
    const searchQuery = normalizeSearchQuery(
      requestUrl.searchParams.get("q") ?? requestUrl.searchParams.get("search")
    );
    const pagination = parseListPagination(requestUrl.searchParams);
    const fieldsMode: AssetFieldMode =
      (requestUrl.searchParams.get("fields") || "").trim().toLowerCase() === "lite"
        ? "lite"
        : "full";

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const { context } = contextResult;
    const targetOrganizationId = context.targetOrganization.id;
    const listCacheHash = Buffer.from(
      [
        context.userId,
        context.mode,
        context.tenantOrganization.id,
        targetOrganizationId,
        context.selectedBrandSlug || "-",
        requestUrl.searchParams.toString(),
      ].join("|")
    ).toString("base64url");
    const listCacheKey = CacheKeys.assetsList(`${targetOrganizationId}:${listCacheHash}`);
    const cachedPayload = await redisCache.get<Record<string, unknown>>(listCacheKey);
    if (cachedPayload) {
      return NextResponse.json(cachedPayload);
    }
    const db = new DatabaseQueries(getSupabaseServer());
    const isPartnerAllViewRequest =
      requestedViewScope === "all" &&
      context.mode === "tenant" &&
      context.tenantOrganization.organizationType === "partner";

    if (isPartnerAllViewRequest) {
      const tenantOrganizationId = context.tenantOrganization.id;
      const brandOrganizationIds = await resolvePartnerSharedBrandOrganizationIds({
        partnerOrganizationId: tenantOrganizationId,
      });

      const grantedByBrand = await Promise.all(
        brandOrganizationIds.map(async (brandOrganizationId) => {
          const granted = await resolvePartnerGrantedAssetIds({
            brandOrganizationId,
            partnerOrganizationId: tenantOrganizationId,
            scope: {
              marketId: selectedMarketId,
              channelId: selectedChannelId,
              localeId: selectedLocaleId,
              destinationId: selectedDestinationId,
            },
          });
          if (!granted.foundationAvailable || granted.assetIds.length === 0) {
            return null;
          }
          return {
            brandOrganizationId,
            assetIds: new Set(granted.assetIds),
          };
        })
      );

      const brandsWithAssets = grantedByBrand.filter(
        (
          row
        ): row is {
          brandOrganizationId: string;
          assetIds: Set<string>;
        } => Boolean(row)
      );

      const ownAssets = await db.getAssetsByOrganization(tenantOrganizationId, undefined, 5000, 0);
      const sharedAssetsByBrand = await Promise.all(
        brandsWithAssets.map(async ({ brandOrganizationId, assetIds }) => {
          const brandAssets = await db.getAssetsByOrganization(brandOrganizationId, undefined, 5000, 0);
          return brandAssets.filter((asset) => assetIds.has(asset.id));
        })
      );

      const mergedAssetsById = new Map<string, LooseAsset>();
      for (const asset of ownAssets) {
        mergedAssetsById.set(asset.id, {
          ...asset,
          tenant_owned: true,
        });
      }
      for (const asset of sharedAssetsByBrand.flat()) {
        mergedAssetsById.set(asset.id, {
          ...asset,
          tenant_owned: false,
        });
      }

      let assets: LooseAsset[] = Array.from(mergedAssetsById.values());
      assets.sort(
        (a, b) =>
          new Date(String(b.createdAt || b.created_at || 0)).getTime() -
          new Date(String(a.createdAt || a.created_at || 0)).getTime()
      );

      if (selectedFolderId) {
        if (selectedFolderId === "unfiled") {
          assets = assets.filter((asset) => !asset.folderId && !asset.folder_id);
        } else {
          assets = assets.filter(
            (asset) => (asset.folderId || asset.folder_id) === selectedFolderId
          );
        }
      }

      if (selectedProductIds.length > 0) {
        const scopedOrganizationIds = [tenantOrganizationId, ...brandOrganizationIds];
        const { data: productAssetLinks } = await getSupabaseServer()
          .from("product_asset_links")
          .select("asset_id")
          .in("organization_id", scopedOrganizationIds)
          .in("product_id", selectedProductIds)
          .eq("is_active", true);

        const linkedAssetIds = new Set<string>(
          ((productAssetLinks || []) as Array<{ asset_id: string | null }>)
            .map((row) => row.asset_id)
            .filter((id): id is string => Boolean(id))
        );

        assets = assets.filter((asset) => linkedAssetIds.has(asset.id));
      }
      assets = filterAssetsByRecency({
        assets,
        createdAfter,
        updatedAfter,
      });
      assets = filterAssetsByStructuredFields(assets, {
        fileType: filterFileType,
        assetStatus: filterAssetStatus,
        complianceStatus: filterComplianceStatus,
        brandLegalApproval: filterBrandLegalApproval,
        artworkType: filterArtworkType,
        printVsDigital: filterPrintVsDigital,
        wadaRiskLevel: filterWadaRiskLevel,
        athleteNames: filterAthleteNames,
        certifications: filterCertifications,
        regulatoryRegion: filterRegulatoryRegion,
        expiringBefore: filterExpiringBefore,
      });
      assets = filterAssetsBySearch(assets, searchQuery);
      const responseAssets = assets
        .map((asset) => normalizeAssetDeliveryUrls(asset))
        .map((asset) => selectAssetFields(asset, fieldsMode));
      const pagedAssets = paginateRows(responseAssets, pagination);

      const [folders, permissions, tagsResult, categoriesResult] = await Promise.all([
        db.getFoldersByOrganization(tenantOrganizationId),
        db.getUserPermissions(context.userId, tenantOrganizationId),
        getSupabaseServer()
          .from("asset_tags")
          .select("*")
          .eq("organization_id", tenantOrganizationId)
          .order("name", { ascending: true }),
        getSupabaseServer()
          .from("asset_categories")
          .select("*")
          .eq("organization_id", tenantOrganizationId)
          .order("path", { ascending: true }),
      ]);

      const payload = {
        data: {
          assets: pagedAssets.rows,
          pagination: pagedAssets.meta,
          folders,
          tags: tagsResult.data || [],
          categories: categoriesResult.data || [],
          permissions,
          view: {
            mode: context.mode,
            selectedBrandSlug: context.selectedBrandSlug,
            tenantSlug: context.tenantOrganization.slug,
          },
        },
      };
      await redisCache.set(listCacheKey, payload, LIST_CACHE_TTL_SECONDS);
      return NextResponse.json(payload);
    }

    let allowedAssetIds: Set<string> | null = null;
    let hasOrgAssetScope = true;
    let restrictToSharedAssetScope = false;

    // Market catalog filtering applies to partner views only.
    // The brand's own library (mode === "tenant") always shows all org assets regardless
    // of market selection — the market toolbar is contextual (completeness, etc.), not a
    // visibility gate on the brand's own files.
    // For partner_brand, resolvePartnerGrantedAssetIds handles market access via partner_market_assignments.

    if (context.mode === "partner_brand") {
      const entitlements = await resolvePartnerEntitlements({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
        scope: {
          marketId: selectedMarketId,
          channelId: selectedChannelId,
          localeId: selectedLocaleId,
          destinationId: selectedDestinationId,
        },
      });

      if (selectedDestinationId && !entitlements.requestedDestinationGranted) {
        return emptyPartnerAssetsResponse({
          mode: context.mode,
          selectedBrandSlug: context.selectedBrandSlug,
          tenantSlug: context.tenantOrganization.slug,
        });
      }

      if (selectedDestinationId && !entitlements.requestedDestinationPublished) {
        return emptyPartnerAssetsResponse({
          mode: context.mode,
          selectedBrandSlug: context.selectedBrandSlug,
          tenantSlug: context.tenantOrganization.slug,
        });
      }

      if (entitlements.assetFoundationAvailable) {
        hasOrgAssetScope = false;
        allowedAssetIds = new Set(entitlements.assetIds);

        if (entitlements.assetIds.length === 0) {
          return emptyPartnerAssetsResponse({
            mode: context.mode,
            selectedBrandSlug: context.selectedBrandSlug,
            tenantSlug: context.tenantOrganization.slug,
          });
        }
      } else {
        if (!context.brandMemberId) {
          return emptyPartnerAssetsResponse({
            mode: context.mode,
            selectedBrandSlug: context.selectedBrandSlug,
            tenantSlug: context.tenantOrganization.slug,
          });
        }

        const scopedPermissions = await getScopedPermissionSummary({
          organizationId: targetOrganizationId,
          memberId: context.brandMemberId,
          permissionKeys: ASSET_VIEW_PERMISSION_KEYS,
        });

        hasOrgAssetScope = scopedPermissions.hasOrganizationScope;
        if (!scopedPermissions.hasOrganizationScope) {
          if (scopedPermissions.collectionIds.length > 0) {
            const collectionAssetIds = await resolveCollectionAssetIds({
              organizationId: targetOrganizationId,
              collectionIds: scopedPermissions.collectionIds,
            });
            allowedAssetIds = new Set(collectionAssetIds);
          } else {
            // Fallback for legacy invite grants that are not collection-scoped.
            restrictToSharedAssetScope = true;
          }
        }

        const hasAnyAssetScope =
          scopedPermissions.hasOrganizationScope ||
          scopedPermissions.collectionIds.length > 0 ||
          scopedPermissions.marketIds.length > 0 ||
          scopedPermissions.channelIds.length > 0;

        if (!hasAnyAssetScope) {
          return emptyPartnerAssetsResponse({
            mode: context.mode,
            selectedBrandSlug: context.selectedBrandSlug,
            tenantSlug: context.tenantOrganization.slug,
          });
        }
      }
    }

    let assets = await db.getAssetsByOrganization(
      targetOrganizationId,
      selectedFolderId || undefined,
      5000,
      0
    );

    if (allowedAssetIds) {
      assets = assets.filter((asset) => allowedAssetIds!.has(asset.id));
    }
    if (restrictToSharedAssetScope) {
      assets = assets.filter((asset) => (asset.assetScope || "").toLowerCase() === "shared");
    }

    if (selectedProductIds.length > 0) {
      const { data: productAssetLinks } = await getSupabaseServer()
        .from("product_asset_links")
        .select("asset_id")
        .eq("organization_id", targetOrganizationId)
        .in("product_id", selectedProductIds)
        .eq("is_active", true);

      const linkedAssetIds = new Set<string>(
        ((productAssetLinks || []) as Array<{ asset_id: string | null }>)
          .map((row) => row.asset_id)
          .filter((id): id is string => Boolean(id))
      );
      assets = assets.filter((asset) => linkedAssetIds.has(asset.id));
    }
    assets = assets.map((asset) => normalizeDamAssetRecord(asset));
    assets = filterAssetsByRecency({
      assets,
      createdAfter,
      updatedAfter,
    });
    assets = filterAssetsByStructuredFields(assets, {
      fileType: filterFileType,
      assetStatus: filterAssetStatus,
      complianceStatus: filterComplianceStatus,
      brandLegalApproval: filterBrandLegalApproval,
      artworkType: filterArtworkType,
      printVsDigital: filterPrintVsDigital,
      wadaRiskLevel: filterWadaRiskLevel,
      athleteNames: filterAthleteNames,
      certifications: filterCertifications,
      regulatoryRegion: filterRegulatoryRegion,
      expiringBefore: filterExpiringBefore,
    });
    assets = filterAssetsBySearch(assets, searchQuery);
    const responseAssets = assets
      .map((asset) => normalizeAssetDeliveryUrls(asset))
      .map((asset) => selectAssetFields(asset, fieldsMode));
    const pagedAssets = paginateRows(responseAssets, pagination);

    let folders = await db.getFoldersByOrganization(targetOrganizationId);
    if (context.mode === "partner_brand" && !hasOrgAssetScope) {
      const directFolderIds = new Set<string>();
      for (const asset of assets) {
        if (asset.folderId) {
          directFolderIds.add(asset.folderId);
        }
      }

      if (directFolderIds.size > 0) {
        const visibleFolderPaths = new Set<string>();
        for (const folder of folders) {
          if (directFolderIds.has(folder.id)) {
            visibleFolderPaths.add(folder.path);
          }
        }

        folders = folders.filter((folder) => {
          for (const path of visibleFolderPaths) {
            if (folder.path === path || path.startsWith(`${folder.path}/`)) {
              return true;
            }
          }
          return false;
        });
      } else {
        folders = [];
      }
    }

    const [{ data: tags }, { data: categories }] = await Promise.all([
      getSupabaseServer()
        .from("asset_tags")
        .select("*")
        .eq("organization_id", targetOrganizationId)
        .order("name", { ascending: true }),
      getSupabaseServer()
        .from("asset_categories")
        .select("*")
        .eq("organization_id", targetOrganizationId)
        .order("path", { ascending: true }),
    ]);

    const permissions =
      context.mode === "partner_brand"
        ? {
            ...DEFAULT_PERMISSIONS,
            role: "partner",
            is_partner: true,
          }
        : await db.getUserPermissions(context.userId, targetOrganizationId);

    const payload = {
      data: {
        assets: pagedAssets.rows,
        pagination: pagedAssets.meta,
        folders,
        tags: tags || [],
        categories: categories || [],
        permissions,
        view: {
          mode: context.mode,
          selectedBrandSlug: context.selectedBrandSlug,
          tenantSlug: context.tenantOrganization.slug,
        },
      },
    };
    await redisCache.set(listCacheKey, payload, LIST_CACHE_TTL_SECONDS);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /assets failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
