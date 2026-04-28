import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { evaluateProductCompleteness } from "@/lib/family-attributes";
import {
  PRODUCT_VIEW_PERMISSION_KEYS,
  getScopedPermissionSummary,
  resolvePartnerGrantedProductIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";
import { getChannelScopedProductIds } from "@/lib/product-channel-scope";
import { cache as redisCache, CacheKeys } from "@/lib/redis";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
const MAX_PRODUCT_IDS = 300;
const COMPLETENESS_CONCURRENCY = 12;
const COMPLETENESS_CACHE_TTL_SECONDS = 60;

const normalizeToken = (value: string | null): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCode = (value: string | null): string | null => {
  const token = normalizeToken(value);
  return token ? token.toLowerCase() : null;
};

const normalizeRequestedProductIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  const deduped = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;

    const uuidPrefixMatch = trimmed.match(UUID_PREFIX_PATTERN);
    const candidateId = uuidPrefixMatch?.[1] || trimmed;
    if (!UUID_PATTERN.test(candidateId)) continue;

    deduped.add(candidateId);
    if (deduped.size >= MAX_PRODUCT_IDS) break;
  }

  return Array.from(deduped);
};

const parseCachedScoreMap = (value: unknown): Record<string, number> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed: Record<string, number> = {};
  for (const [productId, rawScore] of Object.entries(value as Record<string, unknown>)) {
    if (!UUID_PATTERN.test(productId)) continue;
    const numericValue =
      typeof rawScore === "number"
        ? rawScore
        : typeof rawScore === "string"
        ? Number.parseFloat(rawScore)
        : Number.NaN;
    if (!Number.isFinite(numericValue)) continue;
    parsed[productId] = Math.min(100, Math.max(0, Math.round(numericValue)));
  }
  return parsed;
};

const buildCompletenessBatchCacheKey = (params: {
  targetOrganizationId: string;
  tenantOrganizationId: string;
  selectedBrandSlug: string | null;
  mode: string;
  brandMemberId: string | null;
  marketId: string | null;
  channelId: string | null;
  localeId: string | null;
  destinationId: string | null;
  channelCode: string | null;
  localeCode: string | null;
  destinationCode: string | null;
  productIds: string[];
}): string => {
  const sortedIds = [...params.productIds].sort();
  const idsHash = createHash("sha1").update(sortedIds.join(",")).digest("hex");

  const descriptor = [
    `mode=${params.mode}`,
    `targetOrg=${params.targetOrganizationId}`,
    `tenantOrg=${params.tenantOrganizationId}`,
    `brand=${params.selectedBrandSlug || "-"}`,
    `brandMember=${params.brandMemberId || "-"}`,
    `market=${params.marketId || "-"}`,
    `channel=${params.channelId || "-"}`,
    `locale=${params.localeId || "-"}`,
    `destination=${params.destinationId || "-"}`,
    `channelCode=${params.channelCode || "-"}`,
    `localeCode=${params.localeCode || "-"}`,
    `destinationCode=${params.destinationCode || "-"}`,
    `ids=${idsHash}`,
  ].join("|");

  return CacheKeys.apiResponse("products:completeness:batch", descriptor);
};

async function resolveChannelScopedProductIds(params: {
  organizationId: string;
  memberId: string;
}): Promise<string[] | null> {
  const scopedPermissions = await getScopedPermissionSummary({
    organizationId: params.organizationId,
    memberId: params.memberId,
    permissionKeys: PRODUCT_VIEW_PERMISSION_KEYS,
  });

  const hasAnyProductScope =
    scopedPermissions.hasOrganizationScope ||
    scopedPermissions.marketIds.length > 0 ||
    scopedPermissions.channelIds.length > 0;

  if (!hasAnyProductScope) {
    return [];
  }

  if (!scopedPermissions.hasOrganizationScope && scopedPermissions.channelIds.length > 0) {
    const scopedIds = new Set<string>();
    for (const channelId of scopedPermissions.channelIds) {
      const ids = await getChannelScopedProductIds({
        supabase: supabase,
        organizationId: params.organizationId,
        channelId,
      });
      for (const id of ids || []) {
        scopedIds.add(id);
      }
    }
    return Array.from(scopedIds);
  }

  return null;
}

async function resolveScopeIds(params: {
  organizationId: string;
  marketId: string | null;
  channelId: string | null;
  channelCode: string | null;
  localeId: string | null;
  localeCode: string | null;
  destinationId: string | null;
  destinationCode: string | null;
}) {
  const marketId =
    params.marketId && UUID_PATTERN.test(params.marketId) ? params.marketId : null;

  let channelId = params.channelId;
  if (!channelId && params.channelCode) {
    const { data } = await supabase
      .from("channels")
      .select("id")
      .eq("organization_id", params.organizationId)
      .ilike("code", params.channelCode)
      .maybeSingle();
    channelId = (data as { id: string } | null)?.id || null;
  }

  let localeId = params.localeId;
  if (!localeId && params.localeCode) {
    const { data } = await supabase
      .from("locales")
      .select("id")
      .ilike("code", params.localeCode)
      .maybeSingle();
    localeId = (data as { id: string } | null)?.id || null;
  }

  let destinationId = params.destinationId;
  if (!destinationId && params.destinationCode) {
    const { data } = await supabase
      .from("channel_destinations")
      .select("id")
      .eq("organization_id", params.organizationId)
      .ilike("code", params.destinationCode)
      .maybeSingle();
    destinationId = (data as { id: string } | null)?.id || null;
  }

  return {
    marketId,
    channelId,
    localeId,
    destinationId,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const output = new Array<R>(items.length);
  let nextIndex = 0;

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) {
        break;
      }
      output[current] = await mapper(items[current]);
    }
  });

  await Promise.all(workers);
  return output;
}

type BatchRequestBody = {
  productIds?: unknown;
};

type ProductRow = {
  id: string;
  family_id: string | null;
};

// POST /api/[tenant]/products/completeness/batch
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const searchParams = new URL(request.url).searchParams;
    const selectedBrandSlug = searchParams.get("brand");

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
    const marketId = normalizeToken(searchParams.get("marketId"));
    const channelId = normalizeToken(searchParams.get("channelId"));
    const localeId = normalizeToken(searchParams.get("localeId"));
    const destinationId = normalizeToken(searchParams.get("destinationId"));
    const channelCode = normalizeCode(searchParams.get("channel"));
    const localeCode = normalizeCode(searchParams.get("locale"));
    const destinationCode = normalizeCode(searchParams.get("destination"));

    const resolvedScopeIds = await resolveScopeIds({
      organizationId: targetOrganizationId,
      marketId,
      channelId,
      channelCode,
      localeId,
      localeCode,
      destinationId,
      destinationCode,
    });

    const payload = (await request.json().catch(() => null)) as BatchRequestBody | null;
    const requestedProductIds = normalizeRequestedProductIds(payload?.productIds || []);

    if (requestedProductIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { scores: {} as Record<string, number> },
      });
    }

    let constrainedProductIds: string[] | null = null;
    if (context.mode === "partner_brand") {
      const grantedSetProducts = await resolvePartnerGrantedProductIds({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
        scope: {
          marketId: resolvedScopeIds.marketId,
          channelId: resolvedScopeIds.channelId,
          localeId: resolvedScopeIds.localeId,
          destinationId: resolvedScopeIds.destinationId,
        },
      });

      if (grantedSetProducts.foundationAvailable) {
        constrainedProductIds = grantedSetProducts.productIds;
      } else if (!context.brandMemberId) {
        constrainedProductIds = [];
      } else {
        constrainedProductIds = await resolveChannelScopedProductIds({
          organizationId: targetOrganizationId,
          memberId: context.brandMemberId,
        });
      }
    }

    if (constrainedProductIds && constrainedProductIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { scores: {} as Record<string, number> },
      });
    }

    const allowedProductIds =
      constrainedProductIds && constrainedProductIds.length > 0
        ? requestedProductIds.filter((id) => constrainedProductIds.includes(id))
        : requestedProductIds;

    if (allowedProductIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { scores: {} as Record<string, number> },
      });
    }

    const cacheKey = buildCompletenessBatchCacheKey({
      targetOrganizationId,
      tenantOrganizationId: context.tenantOrganization.id,
      selectedBrandSlug: selectedBrandSlug ? selectedBrandSlug.trim().toLowerCase() : null,
      mode: context.mode,
      brandMemberId: context.brandMemberId || null,
      marketId: resolvedScopeIds.marketId,
      channelId: resolvedScopeIds.channelId,
      localeId: resolvedScopeIds.localeId,
      destinationId: resolvedScopeIds.destinationId,
      channelCode,
      localeCode,
      destinationCode,
      productIds: allowedProductIds,
    });

    const cachedScores = parseCachedScoreMap(await redisCache.get<unknown>(cacheKey));
    if (cachedScores) {
      return NextResponse.json({
        success: true,
        data: {
          scores: cachedScores,
          scope: {
            marketId: resolvedScopeIds.marketId,
            channelId: resolvedScopeIds.channelId,
            localeId: resolvedScopeIds.localeId,
            destinationId: resolvedScopeIds.destinationId,
          },
          cached: true,
        },
      });
    }

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id,family_id")
      .eq("organization_id", targetOrganizationId)
      .in("id", allowedProductIds);

    if (productsError) {
      console.error("Failed to load products for batch completeness:", productsError);
      return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
    }

    const productRows = ((products || []) as ProductRow[]).filter((row) => UUID_PATTERN.test(row.id));
    if (productRows.length === 0) {
      return NextResponse.json({
        success: true,
        data: { scores: {} as Record<string, number> },
      });
    }

    const scoredRows = await mapWithConcurrency(
      productRows,
      COMPLETENESS_CONCURRENCY,
      async (product) => {
        try {
          const result = await evaluateProductCompleteness(
            targetOrganizationId,
            product.id,
            product.family_id,
            {},
            {
              marketId: resolvedScopeIds.marketId,
              channelId: resolvedScopeIds.channelId,
              channelCode,
              localeId: resolvedScopeIds.localeId,
              localeCode,
              destinationId: resolvedScopeIds.destinationId,
            },
            {
              syncFamilyAttributes: false,
            }
          );

          const percent =
            result.requiredCount > 0
              ? Math.round((result.completeCount / result.requiredCount) * 100)
              : 100;
          return { productId: product.id, percent };
        } catch (error) {
          console.error("Failed to evaluate product completeness in batch:", {
            productId: product.id,
            organizationId: targetOrganizationId,
            error,
          });
          return { productId: product.id, percent: 0 };
        }
      }
    );

    const scores: Record<string, number> = {};
    scoredRows.forEach((row) => {
      scores[row.productId] = row.percent;
    });

    await redisCache.set(cacheKey, scores, COMPLETENESS_CACHE_TTL_SECONDS);

    return NextResponse.json({
      success: true,
      data: {
        scores,
        scope: {
          marketId: resolvedScopeIds.marketId,
          channelId: resolvedScopeIds.channelId,
          localeId: resolvedScopeIds.localeId,
          destinationId: resolvedScopeIds.destinationId,
        },
        cached: false,
      },
    });
  } catch (error) {
    console.error("Error in batch product completeness API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
