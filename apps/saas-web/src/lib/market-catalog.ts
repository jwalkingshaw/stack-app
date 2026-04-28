import { supabaseServer } from "@/lib/supabase";

type ShareSetModule = "assets" | "products";

type CatalogSetRow = {
  id: string;
  name: string;
};

type CatalogSetAssignments = {
  foundationAvailable: boolean;
  productSetIds: string[];
  assetSetIds: string[];
  productSets: CatalogSetRow[];
  assetSets: CatalogSetRow[];
};

type CatalogIdResult = {
  foundationAvailable: boolean;
  ids: string[];
};

type ReplaceAssignmentsResult =
  | { ok: true; data: CatalogSetAssignments }
  | { ok: false; status: number; error: string };

const GLOBAL_PRODUCTS_SET_NAME = "Global Products";
const GLOBAL_ASSETS_SET_NAME = "Global Assets";
const GLOBAL_SET_SYNC_TTL_MS = 5 * 60 * 1000;
const globalSetSyncTimestamps = new Map<string, number>();

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function isMissingMarketCatalogFoundationError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("market_set_assignments") ||
    message.includes("share_set_items") ||
    message.includes("share_sets")
  );
}

function buildGlobalSetSeedRow(params: {
  organizationId: string;
  moduleKey: ShareSetModule;
  createdBy: string;
}) {
  if (params.moduleKey === "products") {
    return {
      organization_id: params.organizationId,
      module_key: "products",
      name: GLOBAL_PRODUCTS_SET_NAME,
      description: "System-managed catalog set for broadly eligible products.",
      metadata: {
        system: true,
        global: true,
        eligibility: {
          status: ["Active"],
        },
      },
      created_by: params.createdBy,
    };
  }

  return {
    organization_id: params.organizationId,
    module_key: "assets",
    name: GLOBAL_ASSETS_SET_NAME,
    description: "System-managed catalog set for broadly eligible assets.",
    metadata: {
      system: true,
      global: true,
      eligibility: {
        asset_scope: ["shared", "public"],
        version_window: "valid_now",
      },
    },
    created_by: params.createdBy,
  };
}

async function resolveGlobalSetIds(params: {
  organizationId: string;
}): Promise<{ foundationAvailable: boolean; productSetId: string | null; assetSetId: string | null }> {
  const { data, error } = await supabaseServer
    .from("share_sets")
    .select("id,module_key,name")
    .eq("organization_id", params.organizationId)
    .in("module_key", ["products", "assets"])
    .in("name", [GLOBAL_PRODUCTS_SET_NAME, GLOBAL_ASSETS_SET_NAME]);

  if (error) {
    if (isMissingMarketCatalogFoundationError(error)) {
      return { foundationAvailable: false, productSetId: null, assetSetId: null };
    }
    console.error("Failed to resolve global catalog sets:", error);
    return { foundationAvailable: true, productSetId: null, assetSetId: null };
  }

  let productSetId: string | null = null;
  let assetSetId: string | null = null;
  for (const row of (data || []) as Array<{
    id: string | null;
    module_key: string | null;
    name: string | null;
  }>) {
    if (!row.id) continue;
    if (row.module_key === "products" && row.name === GLOBAL_PRODUCTS_SET_NAME) {
      productSetId = row.id;
    }
    if (row.module_key === "assets" && row.name === GLOBAL_ASSETS_SET_NAME) {
      assetSetId = row.id;
    }
  }

  return { foundationAvailable: true, productSetId, assetSetId };
}

export async function ensureDefaultGlobalCatalogSets(params: {
  organizationId: string;
  userId: string;
}): Promise<{ foundationAvailable: boolean; productSetId: string | null; assetSetId: string | null }> {
  const initial = await resolveGlobalSetIds({ organizationId: params.organizationId });
  if (!initial.foundationAvailable) return initial;

  const missingRows: Array<Record<string, unknown>> = [];
  if (!initial.productSetId) {
    missingRows.push(
      buildGlobalSetSeedRow({
        organizationId: params.organizationId,
        moduleKey: "products",
        createdBy: params.userId,
      })
    );
  }
  if (!initial.assetSetId) {
    missingRows.push(
      buildGlobalSetSeedRow({
        organizationId: params.organizationId,
        moduleKey: "assets",
        createdBy: params.userId,
      })
    );
  }

  if (missingRows.length === 0) return initial;

  const { error } = await supabaseServer
    .from("share_sets")
    .upsert(missingRows as never, { onConflict: "organization_id,module_key,name" });

  if (error) {
    if (isMissingMarketCatalogFoundationError(error)) {
      return { foundationAvailable: false, productSetId: null, assetSetId: null };
    }
    console.error("Failed to seed global catalog sets:", error);
    return initial;
  }

  return resolveGlobalSetIds({ organizationId: params.organizationId });
}

export async function addResourceToGlobalCatalogSet(params: {
  organizationId: string;
  userId: string;
  moduleKey: ShareSetModule;
  resourceType: "asset" | "product" | "variant";
  resourceId: string;
  includeDescendants?: boolean;
}): Promise<{ foundationAvailable: boolean; applied: boolean }> {
  const resourceId = String(params.resourceId || "").trim();
  if (!resourceId) return { foundationAvailable: true, applied: false };

  const ensured = await ensureDefaultGlobalCatalogSets({
    organizationId: params.organizationId,
    userId: params.userId,
  });
  if (!ensured.foundationAvailable) {
    return { foundationAvailable: false, applied: false };
  }

  const shareSetId =
    params.moduleKey === "products" ? ensured.productSetId : ensured.assetSetId;
  if (!shareSetId) {
    return { foundationAvailable: true, applied: false };
  }

  const { error } = await supabaseServer
    .from("share_set_items")
    .upsert(
      [
        {
          share_set_id: shareSetId,
          organization_id: params.organizationId,
          resource_type: params.resourceType,
          resource_id: resourceId,
          include_descendants: Boolean(params.includeDescendants),
          market_ids: [],
          channel_ids: [],
          locale_ids: [],
          metadata: {
            source: "global_default_auto_include",
            updated_by: params.userId,
            updated_at: new Date().toISOString(),
          },
          created_by: params.userId,
        },
      ] as never,
      { onConflict: "share_set_id,resource_type,resource_id" }
    );

  if (error) {
    if (isMissingMarketCatalogFoundationError(error)) {
      return { foundationAvailable: false, applied: false };
    }
    console.error("Failed to upsert global catalog set membership:", error);
    return { foundationAvailable: true, applied: false };
  }

  return { foundationAvailable: true, applied: true };
}

async function insertMissingGlobalShareSetItems(rows: Array<Record<string, unknown>>): Promise<void> {
  for (const batch of chunkArray(rows, 500)) {
    const { error } = await supabaseServer.from("share_set_items").insert(batch as never);
    if (error) {
      console.error("Failed to insert missing global catalog set membership:", error);
      return;
    }
  }
}

async function syncGlobalProductSetItems(params: {
  organizationId: string;
  shareSetId: string;
}): Promise<void> {
  let productRowsRaw: unknown[] | null = null;
  let productsError: { code?: string; message?: string } | null = null;

  const productsWithVisibility = await supabaseServer
    .from("products")
    .select("id,parent_id,catalog_visibility")
    .eq("organization_id", params.organizationId);

  if (productsWithVisibility.error?.code === "42703") {
    const productsWithoutVisibility = await supabaseServer
      .from("products")
      .select("id,parent_id")
      .eq("organization_id", params.organizationId);
    productRowsRaw = productsWithoutVisibility.data;
    productsError = productsWithoutVisibility.error;
  } else {
    productRowsRaw = productsWithVisibility.data;
    productsError = productsWithVisibility.error;
  }

  const { data: existingRows, error: existingError } = await supabaseServer
    .from("share_set_items")
    .select("resource_type,resource_id")
    .eq("organization_id", params.organizationId)
    .eq("share_set_id", params.shareSetId)
    .in("resource_type", ["product", "variant"]);

  if (productsError) {
    console.error("Failed to load products for global catalog sync:", productsError);
    return;
  }
  if (existingError) {
    console.error("Failed to load existing global product set items:", existingError);
    return;
  }

  const rows = (productRowsRaw || []) as Array<{
    id: string | null;
    parent_id: string | null;
    catalog_visibility: string | null;
  }>;
  const parentIds = new Set(
    rows
      .map((row) => String(row.parent_id || "").trim())
      .filter(Boolean)
  );
  const existingKeys = new Set(
    ((existingRows || []) as Array<{ resource_type: string | null; resource_id: string | null }>)
      .map((row) => {
        const resourceType = String(row.resource_type || "").trim();
        const resourceId = String(row.resource_id || "").trim();
        return resourceType && resourceId ? `${resourceType}:${resourceId}` : "";
      })
      .filter(Boolean)
  );

  const inserts: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const productId = String(row.id || "").trim();
    if (!productId) continue;
    if (String(row.catalog_visibility || "").trim().toLowerCase() === "restricted") continue;

    const isVariant = Boolean(String(row.parent_id || "").trim());
    const resourceType = isVariant ? "variant" : "product";
    const itemKey = `${resourceType}:${productId}`;
    if (existingKeys.has(itemKey)) continue;

    inserts.push({
      share_set_id: params.shareSetId,
      organization_id: params.organizationId,
      resource_type: resourceType,
      resource_id: productId,
      include_descendants: !isVariant && parentIds.has(productId),
      market_ids: [],
      channel_ids: [],
      locale_ids: [],
      metadata: {
        source: "global_default_auto_include",
        backfill: true,
      },
      created_by: "system-backfill",
    });
  }

  if (inserts.length === 0) return;
  await insertMissingGlobalShareSetItems(inserts);
}

async function syncGlobalAssetSetItems(params: {
  organizationId: string;
  shareSetId: string;
}): Promise<void> {
  const [{ data: assets, error: assetsError }, { data: existingRows, error: existingError }] =
    await Promise.all([
      supabaseServer
        .from("dam_assets")
        .select("id")
        .eq("organization_id", params.organizationId),
      supabaseServer
        .from("share_set_items")
        .select("resource_id")
        .eq("organization_id", params.organizationId)
        .eq("share_set_id", params.shareSetId)
        .eq("resource_type", "asset"),
    ]);

  if (assetsError) {
    console.error("Failed to load assets for global catalog sync:", assetsError);
    return;
  }
  if (existingError) {
    console.error("Failed to load existing global asset set items:", existingError);
    return;
  }

  const existingAssetIds = new Set(
    ((existingRows || []) as Array<{ resource_id: string | null }>)
      .map((row) => String(row.resource_id || "").trim())
      .filter(Boolean)
  );
  const inserts = ((assets || []) as Array<{ id: string | null }>)
    .map((row) => String(row.id || "").trim())
    .filter(Boolean)
    .filter((assetId) => !existingAssetIds.has(assetId))
    .map((assetId) => ({
      share_set_id: params.shareSetId,
      organization_id: params.organizationId,
      resource_type: "asset",
      resource_id: assetId,
      include_descendants: false,
      market_ids: [],
      channel_ids: [],
      locale_ids: [],
      metadata: {
        source: "global_default_auto_include",
        backfill: true,
      },
      created_by: "system-backfill",
    }));

  if (inserts.length === 0) return;
  await insertMissingGlobalShareSetItems(inserts);
}

async function maybeSyncAssignedGlobalSetMembership(params: {
  organizationId: string;
  moduleKey: ShareSetModule;
  setIds: string[];
}): Promise<void> {
  if (params.setIds.length === 0) return;

  const globalSetName =
    params.moduleKey === "products" ? GLOBAL_PRODUCTS_SET_NAME : GLOBAL_ASSETS_SET_NAME;
  const { data, error } = await supabaseServer
    .from("share_sets")
    .select("id,metadata")
    .eq("organization_id", params.organizationId)
    .eq("module_key", params.moduleKey)
    .eq("name", globalSetName)
    .in("id", params.setIds);

  if (error) {
    console.error("Failed to resolve assigned global catalog sets:", error);
    return;
  }

  const now = Date.now();
  for (const row of (data || []) as Array<{ id: string | null; metadata: Record<string, unknown> | null }>) {
    const shareSetId = String(row.id || "").trim();
    if (!shareSetId) continue;

    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : null;
    const backfillCompletedAt =
      metadata && typeof metadata.global_backfill_completed_at === "string"
        ? metadata.global_backfill_completed_at.trim()
        : "";
    if (backfillCompletedAt) {
      continue;
    }

    const cacheKey = `${params.organizationId}:${params.moduleKey}:${shareSetId}`;
    const lastSyncedAt = globalSetSyncTimestamps.get(cacheKey) || 0;
    if (now - lastSyncedAt < GLOBAL_SET_SYNC_TTL_MS) {
      continue;
    }

    if (params.moduleKey === "products") {
      await syncGlobalProductSetItems({
        organizationId: params.organizationId,
        shareSetId,
      });
    } else {
      await syncGlobalAssetSetItems({
        organizationId: params.organizationId,
        shareSetId,
      });
    }

    const nextMetadata = {
      ...(metadata || {}),
      global_backfill_completed_at: new Date().toISOString(),
    };
    const { error: metadataError } = await supabaseServer
      .from("share_sets")
      .update({ metadata: nextMetadata } as never)
      .eq("organization_id", params.organizationId)
      .eq("id", shareSetId);
    if (metadataError) {
      console.error("Failed to mark global catalog backfill complete:", metadataError);
    }

    globalSetSyncTimestamps.set(cacheKey, now);
  }
}

async function resolveAssignedSetIdsByModule(params: {
  organizationId: string;
  marketId: string;
  moduleKey: ShareSetModule;
}): Promise<{ foundationAvailable: boolean; setIds: string[] }> {
  const { organizationId, marketId, moduleKey } = params;

  const { data: assignmentRows, error: assignmentError } = await supabaseServer
    .from("market_set_assignments" as never)
    .select("share_set_id")
    .eq("organization_id", organizationId)
    .eq("market_id", marketId)
    .eq("is_active", true);

  if (assignmentError) {
    if (isMissingMarketCatalogFoundationError(assignmentError)) {
      return { foundationAvailable: false, setIds: [] };
    }
    console.error("Failed to load market set assignments:", assignmentError);
    return { foundationAvailable: true, setIds: [] };
  }

  const assignmentSetIds = dedupe(
    ((assignmentRows || []) as Array<{ share_set_id: string | null }>)
      .map((row) => String(row.share_set_id || "").trim())
      .filter(Boolean)
  );

  if (assignmentSetIds.length === 0) {
    return { foundationAvailable: true, setIds: [] };
  }

  const { data: setRows, error: setError } = await supabaseServer
    .from("share_sets")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("module_key", moduleKey)
    .in("id", assignmentSetIds);

  if (setError) {
    if (isMissingMarketCatalogFoundationError(setError)) {
      return { foundationAvailable: false, setIds: [] };
    }
    console.error("Failed to resolve assigned catalog set ids:", setError);
    return { foundationAvailable: true, setIds: [] };
  }

  const setIds = dedupe(
    ((setRows || []) as Array<{ id: string | null }>)
      .map((row) => String(row.id || "").trim())
      .filter(Boolean)
  );

  return { foundationAvailable: true, setIds };
}

export async function resolveMarketCatalogAssignments(params: {
  organizationId: string;
  marketId: string;
}): Promise<CatalogSetAssignments> {
  const { organizationId, marketId } = params;

  const { data: assignmentRows, error: assignmentError } = await supabaseServer
    .from("market_set_assignments" as never)
    .select("share_set_id")
    .eq("organization_id", organizationId)
    .eq("market_id", marketId)
    .eq("is_active", true);

  if (assignmentError) {
    if (isMissingMarketCatalogFoundationError(assignmentError)) {
      return {
        foundationAvailable: false,
        productSetIds: [],
        assetSetIds: [],
        productSets: [],
        assetSets: [],
      };
    }
    console.error("Failed to load market catalog assignments:", assignmentError);
    return {
      foundationAvailable: true,
      productSetIds: [],
      assetSetIds: [],
      productSets: [],
      assetSets: [],
    };
  }

  const assignmentSetIds = dedupe(
    ((assignmentRows || []) as Array<{ share_set_id: string | null }>)
      .map((row) => String(row.share_set_id || "").trim())
      .filter(Boolean)
  );

  if (assignmentSetIds.length === 0) {
    return {
      foundationAvailable: true,
      productSetIds: [],
      assetSetIds: [],
      productSets: [],
      assetSets: [],
    };
  }

  const { data: setRows, error: setError } = await supabaseServer
    .from("share_sets")
    .select("id,name,module_key")
    .eq("organization_id", organizationId)
    .in("id", assignmentSetIds);

  if (setError) {
    if (isMissingMarketCatalogFoundationError(setError)) {
      return {
        foundationAvailable: false,
        productSetIds: [],
        assetSetIds: [],
        productSets: [],
        assetSets: [],
      };
    }
    console.error("Failed to resolve market catalog sets:", setError);
    return {
      foundationAvailable: true,
      productSetIds: [],
      assetSetIds: [],
      productSets: [],
      assetSets: [],
    };
  }

  const productSets: CatalogSetRow[] = [];
  const assetSets: CatalogSetRow[] = [];

  for (const row of (setRows || []) as Array<{ id: string; name: string | null; module_key: string | null }>) {
    const normalized = {
      id: row.id,
      name: row.name?.trim() || row.id,
    };
    if (row.module_key === "products") productSets.push(normalized);
    if (row.module_key === "assets") assetSets.push(normalized);
  }

  return {
    foundationAvailable: true,
    productSetIds: productSets.map((row) => row.id),
    assetSetIds: assetSets.map((row) => row.id),
    productSets,
    assetSets,
  };
}

async function resolveMarketCatalogIds(params: {
  organizationId: string;
  marketId: string;
  moduleKey: ShareSetModule;
  applyGlobalEligibilityToGlobalSets?: boolean;
}): Promise<CatalogIdResult> {
  const assigned = await resolveAssignedSetIdsByModule(params);
  if (!assigned.foundationAvailable) {
    return { foundationAvailable: false, ids: [] };
  }
  if (assigned.setIds.length === 0) {
    return { foundationAvailable: true, ids: [] };
  }

  const { data: assignedSetRows, error: assignedSetRowsError } = await supabaseServer
    .from("share_sets")
    .select("id,name,metadata")
    .eq("organization_id", params.organizationId)
    .eq("module_key", params.moduleKey)
    .in("id", assigned.setIds);

  if (assignedSetRowsError) {
    if (isMissingMarketCatalogFoundationError(assignedSetRowsError)) {
      return { foundationAvailable: false, ids: [] };
    }
    console.error("Failed to resolve assigned catalog set metadata:", assignedSetRowsError);
    return { foundationAvailable: true, ids: [] };
  }

  const assignedRows = (assignedSetRows || []) as Array<{
    id: string | null;
    name: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  const assignedSetIds = assignedRows
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);

  if (params.moduleKey === "products") {
    const productIds = new Set<string>();
    const globalProductSets = params.applyGlobalEligibilityToGlobalSets
      ? assignedRows.filter((row) => {
      const setId = String(row.id || "").trim();
      if (!setId) return false;
      const metadata =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? row.metadata
          : null;
      return (
        row.name === GLOBAL_PRODUCTS_SET_NAME ||
        Boolean(metadata && metadata.global === true)
      );
        })
      : [];

    if (globalProductSets.length > 0) {
      const combinedStatuses = Array.from(
        new Set(
          globalProductSets.flatMap((row) => {
            const metadata =
              row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? row.metadata
                : null;
            const eligibility =
              metadata && typeof metadata.eligibility === "object" && !Array.isArray(metadata.eligibility)
                ? (metadata.eligibility as Record<string, unknown>)
                : null;
            return readStringArray(eligibility?.status);
          })
        )
      );

      let globalProductsQuery = supabaseServer
        .from("products")
        .select("id")
        .eq("organization_id", params.organizationId);

      if (combinedStatuses.length > 0) {
        globalProductsQuery = globalProductsQuery.in("status", combinedStatuses);
      }

      const { data: globalProducts, error: globalProductsError } = await globalProductsQuery
        .not("catalog_visibility", "in", '("restricted")');

      if (globalProductsError?.code === "42703") {
        const { data: fallbackProducts, error: fallbackError } = await supabaseServer
          .from("products")
          .select("id")
          .eq("organization_id", params.organizationId);
        if (fallbackError) {
          console.error("Failed to resolve global market catalog products:", fallbackError);
        } else {
          for (const row of (fallbackProducts || []) as Array<{ id: string | null }>) {
            if (row.id) productIds.add(row.id);
          }
        }
      } else if (globalProductsError) {
        console.error("Failed to resolve global market catalog products:", globalProductsError);
      } else {
        for (const row of (globalProducts || []) as Array<{ id: string | null }>) {
          if (row.id) productIds.add(row.id);
        }
      }
    }

    const { data: itemRows, error: itemError } = await supabaseServer
      .from("share_set_items")
      .select("resource_type,resource_id,include_descendants")
      .eq("organization_id", params.organizationId)
      .in("share_set_id", assignedSetIds)
      .in("resource_type", ["product", "variant"]);

    if (itemError) {
      if (isMissingMarketCatalogFoundationError(itemError)) {
        return { foundationAvailable: false, ids: [] };
      }
      console.error("Failed to resolve market catalog product items:", itemError);
      return { foundationAvailable: true, ids: Array.from(productIds) };
    }

    const parentIdsWithDescendants = new Set<string>();

    for (const row of (itemRows || []) as Array<{
      resource_type: string;
      resource_id: string | null;
      include_descendants: boolean | null;
    }>) {
      if (!row.resource_id) continue;
      productIds.add(row.resource_id);
      if (row.resource_type === "product" && row.include_descendants) {
        parentIdsWithDescendants.add(row.resource_id);
      }
    }

    if (parentIdsWithDescendants.size > 0) {
      // Exclude partner_exclusive and restricted variants — they must be granted directly
      const { data: descendants, error: descendantsError } = await supabaseServer
        .from("products")
        .select("id")
        .eq("organization_id", params.organizationId)
        .in("parent_id", Array.from(parentIdsWithDescendants))
        .not("catalog_visibility", "in", '("partner_exclusive","restricted")');

      if (descendantsError) {
        console.error("Failed to resolve market catalog variant descendants:", descendantsError);
      } else {
        for (const row of (descendants || []) as Array<{ id: string | null }>) {
          if (row.id) productIds.add(row.id);
        }
      }
    }

    return { foundationAvailable: true, ids: Array.from(productIds) };
  }

  const { data: itemRows, error: itemError } = await supabaseServer
    .from("share_set_items")
    .select("resource_type,resource_id,include_descendants")
    .eq("organization_id", params.organizationId)
    .in("share_set_id", assignedSetIds)
    .in("resource_type", ["asset", "folder"]);

  if (itemError) {
    if (isMissingMarketCatalogFoundationError(itemError)) {
      return { foundationAvailable: false, ids: [] };
    }
    console.error("Failed to resolve market catalog asset items:", itemError);
    return { foundationAvailable: true, ids: [] };
  }

  const assetIds = new Set<string>();
  const folderIds = new Set<string>();

  for (const row of (itemRows || []) as Array<{
    resource_type: string;
    resource_id: string | null;
  }>) {
    if (!row.resource_id) continue;
    if (row.resource_type === "asset") {
      assetIds.add(row.resource_id);
    } else if (row.resource_type === "folder") {
      folderIds.add(row.resource_id);
    }
  }

  if (folderIds.size > 0) {
    const { data: folderAssets, error: folderAssetsError } = await supabaseServer
      .from("dam_assets")
      .select("id")
      .eq("organization_id", params.organizationId)
      .in("folder_id", Array.from(folderIds));

    if (folderAssetsError) {
      console.error("Failed to resolve market catalog folder assets:", folderAssetsError);
    } else {
      for (const row of (folderAssets || []) as Array<{ id: string | null }>) {
        if (row.id) assetIds.add(row.id);
      }
    }
  }

  return { foundationAvailable: true, ids: Array.from(assetIds) };
}

export async function resolveMarketCatalogProductIds(params: {
  organizationId: string;
  marketId: string;
  applyGlobalEligibilityToGlobalSets?: boolean;
}): Promise<CatalogIdResult> {
  return resolveMarketCatalogIds({
    organizationId: params.organizationId,
    marketId: params.marketId,
    moduleKey: "products",
    applyGlobalEligibilityToGlobalSets: params.applyGlobalEligibilityToGlobalSets,
  });
}

export async function resolveMarketCatalogAssetIds(params: {
  organizationId: string;
  marketId: string;
}): Promise<CatalogIdResult> {
  return resolveMarketCatalogIds({
    organizationId: params.organizationId,
    marketId: params.marketId,
    moduleKey: "assets",
  });
}

async function validateSetIdsByModule(params: {
  organizationId: string;
  moduleKey: ShareSetModule;
  ids: string[];
}): Promise<{ foundationAvailable: boolean; validIds: string[]; invalidIds: string[] }> {
  if (params.ids.length === 0) {
    return { foundationAvailable: true, validIds: [], invalidIds: [] };
  }

  const { data, error } = await supabaseServer
    .from("share_sets")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("module_key", params.moduleKey)
    .in("id", params.ids);

  if (error) {
    if (isMissingMarketCatalogFoundationError(error)) {
      return { foundationAvailable: false, validIds: [], invalidIds: params.ids };
    }
    console.error("Failed to validate market catalog set ids:", error);
    return { foundationAvailable: true, validIds: [], invalidIds: params.ids };
  }

  const validIds = dedupe(
    ((data || []) as Array<{ id: string | null }>)
      .map((row) => String(row.id || "").trim())
      .filter(Boolean)
  );
  const validSet = new Set(validIds);
  const invalidIds = params.ids.filter((id) => !validSet.has(id));
  return { foundationAvailable: true, validIds, invalidIds };
}

export async function replaceMarketCatalogAssignments(params: {
  organizationId: string;
  marketId: string;
  userId: string;
  productSetIds: string[];
  assetSetIds: string[];
}): Promise<ReplaceAssignmentsResult> {
  const productSetIds = dedupe(params.productSetIds);
  const assetSetIds = dedupe(params.assetSetIds);

  const [validatedProducts, validatedAssets] = await Promise.all([
    validateSetIdsByModule({
      organizationId: params.organizationId,
      moduleKey: "products",
      ids: productSetIds,
    }),
    validateSetIdsByModule({
      organizationId: params.organizationId,
      moduleKey: "assets",
      ids: assetSetIds,
    }),
  ]);

  if (!validatedProducts.foundationAvailable || !validatedAssets.foundationAvailable) {
    return {
      ok: false,
      status: 503,
      error: "Market catalog foundation is unavailable. Apply database migrations first.",
    };
  }

  const invalidIds = [...validatedProducts.invalidIds, ...validatedAssets.invalidIds];
  if (invalidIds.length > 0) {
    return {
      ok: false,
      status: 400,
      error: "One or more set IDs are invalid for this organization/module.",
    };
  }

  const desiredSetIds = dedupe([...validatedProducts.validIds, ...validatedAssets.validIds]);

  const { data: existingRows, error: existingError } = await supabaseServer
    .from("market_set_assignments" as never)
    .select("share_set_id")
    .eq("organization_id", params.organizationId)
    .eq("market_id", params.marketId)
    .eq("is_active", true);

  if (existingError) {
    if (isMissingMarketCatalogFoundationError(existingError)) {
      return {
        ok: false,
        status: 503,
        error: "Market catalog foundation is unavailable. Apply database migrations first.",
      };
    }
    return {
      ok: false,
      status: 500,
      error: "Failed to load existing market catalog assignments.",
    };
  }

  const existingSetIds = dedupe(
    ((existingRows || []) as Array<{ share_set_id: string | null }>)
      .map((row) => String(row.share_set_id || "").trim())
      .filter(Boolean)
  );
  const existingSet = new Set(existingSetIds);
  const desiredSet = new Set(desiredSetIds);

  const toActivate = desiredSetIds.filter((setId) => !existingSet.has(setId));
  const toDeactivate = existingSetIds.filter((setId) => !desiredSet.has(setId));

  if (toActivate.length > 0) {
    const upsertRows = toActivate.map((setId) => ({
      organization_id: params.organizationId,
      market_id: params.marketId,
      share_set_id: setId,
      is_active: true,
      created_by: params.userId,
      metadata: {
        source: "manual",
        updated_by: params.userId,
        updated_at: new Date().toISOString(),
      },
    }));

    const { error: upsertError } = await supabaseServer
      .from("market_set_assignments" as never)
      .upsert(upsertRows as never, { onConflict: "organization_id,market_id,share_set_id" });

    if (upsertError) {
      if (isMissingMarketCatalogFoundationError(upsertError)) {
        return {
          ok: false,
          status: 503,
          error: "Market catalog foundation is unavailable. Apply database migrations first.",
        };
      }
      return {
        ok: false,
        status: 500,
        error: "Failed to save market catalog assignments.",
      };
    }
  }

  if (toDeactivate.length > 0) {
    const { error: deactivateError } = await supabaseServer
      .from("market_set_assignments" as never)
      .update(
        {
          is_active: false,
          metadata: {
            source: "manual",
            updated_by: params.userId,
            updated_at: new Date().toISOString(),
          },
        } as never
      )
      .eq("organization_id", params.organizationId)
      .eq("market_id", params.marketId)
      .eq("is_active", true)
      .in("share_set_id", toDeactivate);

    if (deactivateError) {
      if (isMissingMarketCatalogFoundationError(deactivateError)) {
        return {
          ok: false,
          status: 503,
          error: "Market catalog foundation is unavailable. Apply database migrations first.",
        };
      }
      return {
        ok: false,
        status: 500,
        error: "Failed to update market catalog assignments.",
      };
    }
  }

  const assignments = await resolveMarketCatalogAssignments({
    organizationId: params.organizationId,
    marketId: params.marketId,
  });

  return { ok: true, data: assignments };
}
