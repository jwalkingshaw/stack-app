import { cache as redisCache, CacheKeys } from "@/lib/redis";

export async function invalidateCatalogVisibilityCaches(params: {
  organizationId: string;
  includeProducts?: boolean;
  includeAssets?: boolean;
  includePartnerCatalogExport?: boolean;
}): Promise<void> {
  const includeProducts = params.includeProducts ?? true;
  const includeAssets = params.includeAssets ?? true;
  const includePartnerCatalogExport = params.includePartnerCatalogExport ?? includeProducts;

  const invalidations: Array<Promise<void>> = [];

  if (includeProducts) {
    invalidations.push(
      redisCache.invalidatePattern(`${CacheKeys.productsList(`${params.organizationId}:`)}*`),
      redisCache.invalidatePattern(`${CacheKeys.apiResponse("products", `${params.organizationId}:`)}*`)
    );
  }

  if (includeAssets) {
    invalidations.push(
      redisCache.invalidatePattern(`${CacheKeys.assetsList(`${params.organizationId}:`)}*`),
      redisCache.invalidatePattern(`${CacheKeys.apiResponse("assets", `${params.organizationId}:`)}*`)
    );
  }

  if (includePartnerCatalogExport) {
    invalidations.push(
      redisCache.invalidatePattern(
        `${CacheKeys.apiResponse("partner:catalog:export", `org=${params.organizationId}`)}*`
      )
    );
  }

  await Promise.all(invalidations);
}
