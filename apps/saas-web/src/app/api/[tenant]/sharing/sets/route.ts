import { NextRequest, NextResponse } from "next/server";
import type { Json } from "@stack-app/database";
import { getSupabaseServer } from "@/lib/supabase";
import { logSecurityEvent } from "@/lib/security-audit";
import {
  isMissingColumnError,
  isMissingTableError,
  requireSharingManagerContext,
} from "../_shared";

type ShareSetModule = "assets" | "products";

type ShareSetRow = {
  id: string;
  module_key: ShareSetModule;
  name: string;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ShareSetItemRow = {
  share_set_id: string;
  resource_type: "asset" | "folder" | "product" | "variant";
  market_ids?: string[] | null;
  channel_ids?: string[] | null;
  locale_ids?: string[] | null;
  destination_ids?: string[] | null;
};

type PartnerShareSetGrantRow = {
  share_set_id: string;
  partner_organization_id: string | null;
  status: "active" | "revoked" | null;
};

type AssetSetRow = {
  id: string;
  name: string;
  asset_ids: string[] | null;
  folder_ids?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CollectionGrantRow = {
  collection_id: string | null;
  member_id: string | null;
  permission_key: string | null;
};

type AssetSetSummary = {
  id: string;
  module_key: "assets";
  name: string;
  description: string | null;
  asset_count: number;
  folder_count: number;
  item_count: number;
  scoped_item_count: number;
  market_count: number;
  channel_count: number;
  locale_count: number;
  destination_count: number;
  shared_with_member_count: number;
  grant_count: number;
  created_at: string | null;
  updated_at: string | null;
};

type ProductSetSummary = {
  id: string;
  module_key: "products";
  name: string;
  description: string | null;
  product_count: number;
  variant_count: number;
  item_count: number;
  scoped_item_count: number;
  market_count: number;
  channel_count: number;
  locale_count: number;
  destination_count: number;
  shared_with_member_count: number;
  grant_count: number;
  created_at: string | null;
  updated_at: string | null;
};

function isShareSetModule(value: string | null): value is ShareSetModule {
  return value === "assets" || value === "products";
}

function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
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

function isMissingShareSetFoundationError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error !== "object") return false;
  if (isMissingTableError(error)) return true;
  if ((error as { code?: string }).code === "PGRST205") return true;
  const message = String((error as { message?: string }).message || "").toLowerCase();
  return (
    message.includes("share_sets") ||
    message.includes("share_set_items") ||
    message.includes("partner_share_set_grants")
  );
}

type ShareSetItemsSelectResult = {
  data: ShareSetItemRow[] | null;
  error: { code?: string; message?: string } | null;
};

async function queryShareSetItemsIncludingDestinations(params: {
  organizationId: string;
  setIds: string[];
}): Promise<ShareSetItemsSelectResult> {
  const dynamicSupabase = getSupabaseServer() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown
        ) => {
          in: (
            column: string,
            values: string[]
          ) => Promise<{
            data: unknown[] | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
  };

  const result = await dynamicSupabase
    .from("share_set_items")
    .select("share_set_id,resource_type,market_ids,channel_ids,locale_ids,destination_ids")
    .eq("organization_id", params.organizationId)
    .in("share_set_id", params.setIds);

  return {
    data: (result.data as ShareSetItemRow[] | null) || null,
    error: result.error,
  };
}

async function queryAssetSets(params: {
  organizationId: string;
  searchTerm: string;
  page: number;
  pageSize: number;
}) {
  const { organizationId, searchTerm, page, pageSize } = params;
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let withFolders = getSupabaseServer()
    .from("dam_collections")
    .select("id,name,asset_ids,folder_ids,created_at,updated_at", {
      count: "exact",
    })
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (searchTerm) {
    withFolders = withFolders.ilike("name", `%${searchTerm}%`);
  }

  const withFoldersResult = await withFolders;
  if (!withFoldersResult.error) {
    return withFoldersResult;
  }

  if (!isMissingColumnError(withFoldersResult.error)) {
    return withFoldersResult;
  }

  let withoutFolders = getSupabaseServer()
    .from("dam_collections")
    .select("id,name,asset_ids,created_at,updated_at", {
      count: "exact",
    })
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (searchTerm) {
    withoutFolders = withoutFolders.ilike("name", `%${searchTerm}%`);
  }

  return withoutFolders;
}

async function queryShareSetSummaries(params: {
  organizationId: string;
  searchTerm: string;
  page: number;
  pageSize: number;
  moduleFilter: "all" | ShareSetModule;
}) {
  const { organizationId, searchTerm, page, pageSize, moduleFilter } = params;
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let query = getSupabaseServer()
    .from("share_sets")
    .select("id,module_key,name,description,created_at,updated_at", {
      count: "exact",
    })
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (moduleFilter !== "all") {
    query = query.eq("module_key", moduleFilter);
  }

  if (searchTerm) {
    query = query.ilike("name", `%${searchTerm}%`);
  }

  const setsResult = await query;
  if (setsResult.error) {
    return setsResult;
  }

  const setRows = (setsResult.data || []) as ShareSetRow[];
  if (setRows.length === 0) {
    return {
      data: {
        rows: [] as ShareSetRow[],
        itemRows: [] as ShareSetItemRow[],
        grantRows: [] as PartnerShareSetGrantRow[],
        total: setsResult.count || 0,
      },
      error: null,
    };
  }

  const setIds = setRows.map((row) => row.id);

  const [itemResultWithDestination, grantResult] = await Promise.all([
    queryShareSetItemsIncludingDestinations({
      organizationId,
      setIds,
    }),
    getSupabaseServer()
      .from("partner_share_set_grants")
      .select("share_set_id,partner_organization_id,status")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("share_set_id", setIds),
  ]);

  let itemResult = itemResultWithDestination;
  if (itemResult.error && isMissingColumnError(itemResult.error)) {
    const legacyItemResult = await getSupabaseServer()
      .from("share_set_items")
      .select("share_set_id,resource_type,market_ids,channel_ids,locale_ids")
      .eq("organization_id", organizationId)
      .in("share_set_id", setIds);
    itemResult = {
      data: (legacyItemResult.data as unknown as ShareSetItemRow[] | null) || null,
      error: legacyItemResult.error
        ? {
            code: legacyItemResult.error.code,
            message: legacyItemResult.error.message,
          }
        : null,
    };
  }

  if (itemResult.error) {
    return { data: null, error: itemResult.error };
  }
  if (grantResult.error) {
    return { data: null, error: grantResult.error };
  }

  return {
    data: {
      rows: setRows,
      itemRows: ((itemResult.data || []) as unknown) as ShareSetItemRow[],
      grantRows: (grantResult.data || []) as PartnerShareSetGrantRow[],
      total: setsResult.count || 0,
    },
    error: null,
  };
}

async function queryShareSetModuleTotals(params: {
  organizationId: string;
  moduleFilter: "all" | ShareSetModule;
}) {
  const { organizationId, moduleFilter } = params;

  if (moduleFilter === "assets") {
    return {
      data: { totalAssetSets: await countShareSetsByModule(organizationId, "assets"), totalProductSets: 0 },
      error: null,
    };
  }
  if (moduleFilter === "products") {
    return {
      data: { totalAssetSets: 0, totalProductSets: await countShareSetsByModule(organizationId, "products") },
      error: null,
    };
  }

  const [assetTotal, productTotal] = await Promise.all([
    countShareSetsByModule(organizationId, "assets"),
    countShareSetsByModule(organizationId, "products"),
  ]);

  return {
    data: {
      totalAssetSets: assetTotal,
      totalProductSets: productTotal,
    },
    error: null,
  };
}

async function countShareSetsByModule(
  organizationId: string,
  moduleKey: ShareSetModule
): Promise<number> {
  const { count, error } = await getSupabaseServer()
    .from("share_sets")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("module_key", moduleKey);

  if (error) {
    throw error;
  }
  return count || 0;
}

function summarizeShareSets(params: {
  rows: ShareSetRow[];
  itemRows: ShareSetItemRow[];
  grantRows: PartnerShareSetGrantRow[];
}) {
  const { rows, itemRows, grantRows } = params;
  const itemCounts = new Map<
    string,
    {
      asset: number;
      folder: number;
      product: number;
      variant: number;
      total: number;
      scoped: number;
      marketIds: Set<string>;
      channelIds: Set<string>;
      localeIds: Set<string>;
      destinationIds: Set<string>;
    }
  >();

  for (const row of itemRows) {
    const current =
      itemCounts.get(row.share_set_id) || {
        asset: 0,
        folder: 0,
        product: 0,
        variant: 0,
        total: 0,
        scoped: 0,
        marketIds: new Set<string>(),
        channelIds: new Set<string>(),
        localeIds: new Set<string>(),
        destinationIds: new Set<string>(),
      };

    const marketIds = dedupeStringArray(row.market_ids);
    const channelIds = dedupeStringArray(row.channel_ids);
    const localeIds = dedupeStringArray(row.locale_ids);
    const destinationIds = dedupeStringArray(row.destination_ids);

    if (row.resource_type === "asset") current.asset += 1;
    if (row.resource_type === "folder") current.folder += 1;
    if (row.resource_type === "product") current.product += 1;
    if (row.resource_type === "variant") current.variant += 1;
    current.total += 1;
    if (
      marketIds.length > 0 ||
      channelIds.length > 0 ||
      localeIds.length > 0 ||
      destinationIds.length > 0
    ) {
      current.scoped += 1;
    }
    for (const id of marketIds) current.marketIds.add(id);
    for (const id of channelIds) current.channelIds.add(id);
    for (const id of localeIds) current.localeIds.add(id);
    for (const id of destinationIds) current.destinationIds.add(id);
    itemCounts.set(row.share_set_id, current);
  }

  const grantCounts = new Map<string, { partnerIds: Set<string>; total: number }>();
  for (const row of grantRows) {
    const current =
      grantCounts.get(row.share_set_id) || {
        partnerIds: new Set<string>(),
        total: 0,
      };
    if (row.partner_organization_id) {
      current.partnerIds.add(row.partner_organization_id);
    }
    current.total += 1;
    grantCounts.set(row.share_set_id, current);
  }

  const assetSets: AssetSetSummary[] = [];
  const productSets: ProductSetSummary[] = [];

  for (const row of rows) {
    const counts = itemCounts.get(row.id) || {
      asset: 0,
      folder: 0,
      product: 0,
      variant: 0,
      total: 0,
      scoped: 0,
      marketIds: new Set<string>(),
      channelIds: new Set<string>(),
      localeIds: new Set<string>(),
      destinationIds: new Set<string>(),
    };
    const grants = grantCounts.get(row.id);
    const base = {
      id: row.id,
      name: row.name,
      description: row.description || null,
      scoped_item_count: counts.scoped,
      market_count: counts.marketIds.size,
      channel_count: counts.channelIds.size,
      locale_count: counts.localeIds.size,
      destination_count: counts.destinationIds.size,
      shared_with_member_count: grants?.partnerIds.size || 0,
      grant_count: grants?.total || 0,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };

    if (row.module_key === "assets") {
      assetSets.push({
        ...base,
        module_key: "assets",
        asset_count: counts.asset,
        folder_count: counts.folder,
        item_count: counts.total,
      });
    } else {
      productSets.push({
        ...base,
        module_key: "products",
        product_count: counts.product,
        variant_count: counts.variant,
        item_count: counts.total,
      });
    }
  }

  return { assetSets, productSets };
}

async function buildLegacyAssetSetSummaries(params: {
  organizationId: string;
  searchTerm: string;
  page: number;
  pageSize: number;
}) {
  const { organizationId, searchTerm, page, pageSize } = params;
  const assetSetResult = await queryAssetSets({
    organizationId,
    searchTerm,
    page,
    pageSize,
  });

  if (assetSetResult.error) {
    return { data: null, error: assetSetResult.error };
  }

  const rows = (assetSetResult.data || []) as AssetSetRow[];
  const totalAssetSets = assetSetResult.count || 0;
  const ids = rows.map((row) => row.id);
  const grantCounts = new Map<string, { memberIds: Set<string>; permissionCount: number }>();

  if (ids.length > 0) {
    const { data: grants, error: grantsError } = await getSupabaseServer()
      .from("member_scope_permissions")
      .select("collection_id,member_id,permission_key")
      .eq("organization_id", organizationId)
      .eq("scope_type", "collection")
      .in("collection_id", ids);

    if (grantsError) {
      return { data: null, error: grantsError };
    }

    for (const row of (grants || []) as CollectionGrantRow[]) {
      if (!row.collection_id) continue;
      const existing =
        grantCounts.get(row.collection_id) ||
        { memberIds: new Set<string>(), permissionCount: 0 };

      if (row.member_id) {
        existing.memberIds.add(row.member_id);
      }
      if (row.permission_key) {
        existing.permissionCount += 1;
      }

      grantCounts.set(row.collection_id, existing);
    }
  }

  const assetSets: AssetSetSummary[] = rows.map((row) => {
    const assetIds = dedupeStringArray(row.asset_ids);
    const folderIds = dedupeStringArray(row.folder_ids);
    const grants = grantCounts.get(row.id);
    return {
      id: row.id,
      module_key: "assets",
      name: row.name,
      description: null,
      asset_count: assetIds.length,
      folder_count: folderIds.length,
      item_count: assetIds.length + folderIds.length,
      scoped_item_count: 0,
      market_count: 0,
      channel_count: 0,
      locale_count: 0,
      destination_count: 0,
      shared_with_member_count: grants?.memberIds.size || 0,
      grant_count: grants?.permissionCount || 0,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  });

  return {
    data: {
      assetSets,
      totalAssetSets,
    },
    error: null,
  };
}

async function queryCompactShareSetOptions(params: {
  organizationId: string;
  searchTerm: string;
  page: number;
  pageSize: number;
  moduleFilter: "all" | ShareSetModule;
}) {
  const { organizationId, searchTerm, page, pageSize, moduleFilter } = params;
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let query = getSupabaseServer()
    .from("share_sets")
    .select("id,module_key,name", {
      count: "exact",
    })
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .range(rangeFrom, rangeTo);

  if (moduleFilter !== "all") {
    query = query.eq("module_key", moduleFilter);
  }
  if (searchTerm) {
    query = query.ilike("name", `%${searchTerm}%`);
  }

  const result = await query;
  if (!result.error) {
    const rows = (result.data || []) as Array<{ id: string; module_key: ShareSetModule; name: string }>;
    return {
      success: true as const,
      data: {
        asset_sets: rows
          .filter((row) => row.module_key === "assets")
          .map((row) => ({ id: row.id, name: row.name })),
        product_sets: rows
          .filter((row) => row.module_key === "products")
          .map((row) => ({ id: row.id, name: row.name })),
      },
      meta: {
        page,
        page_size: pageSize,
        total_asset_sets:
          moduleFilter === "assets" ? result.count || 0 : moduleFilter === "products" ? 0 : undefined,
        total_product_sets:
          moduleFilter === "products" ? result.count || 0 : moduleFilter === "assets" ? 0 : undefined,
      },
    };
  }

  if (!isMissingShareSetFoundationError(result.error) || moduleFilter === "products") {
    return {
      success: false as const,
      error: result.error,
    };
  }

  const legacyResult = await queryAssetSets({
    organizationId,
    searchTerm,
    page,
    pageSize,
  });

  if (legacyResult.error) {
    return {
      success: false as const,
      error: legacyResult.error,
    };
  }

  const rows = (legacyResult.data || []) as AssetSetRow[];
  return {
    success: true as const,
    data: {
      asset_sets: rows.map((row) => ({ id: row.id, name: row.name })),
      product_sets: [],
    },
    meta: {
      page,
      page_size: pageSize,
      total_asset_sets: legacyResult.count || 0,
      total_product_sets: 0,
    },
  };
}

// GET /api/[tenant]/sharing/sets
// Scalable saved-scope catalog endpoint. Legacy route name is kept for compatibility.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const url = new URL(request.url);
    const moduleFilterRaw = (url.searchParams.get("module") || "all").toLowerCase();
    const compact = url.searchParams.get("compact") === "1";
    const searchTerm = (url.searchParams.get("search") || "").trim();
    const page = parsePositiveInt(url.searchParams.get("page"), 1, 100000);
    const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 25, 100);

    if (!["all", "assets", "products"].includes(moduleFilterRaw)) {
      return NextResponse.json(
        { error: "module must be one of: all, assets, products" },
        { status: 400 }
      );
    }
    const moduleFilter = moduleFilterRaw as "all" | ShareSetModule;

    if (compact) {
      const compactResult = await queryCompactShareSetOptions({
        organizationId: organization.id,
        searchTerm,
        page,
        pageSize,
        moduleFilter,
      });

      if (compactResult.success) {
        return NextResponse.json({
          success: true,
          data: compactResult.data,
          aliases: {
            asset_saved_scopes: compactResult.data.asset_sets,
            product_saved_scopes: compactResult.data.product_sets,
          },
          meta: compactResult.meta,
          capabilities: {
            product_sets_enabled: true,
            share_sets_v2: true,
            compact: true,
          },
        });
      }

      if (!isMissingShareSetFoundationError(compactResult.error)) {
        return NextResponse.json(
          { error: "Failed to load saved scope options" },
          { status: 500 }
        );
      }
    }

    const shareSetResult = await queryShareSetSummaries({
      organizationId: organization.id,
      searchTerm,
      page,
      pageSize,
      moduleFilter,
    });

    if (!shareSetResult.error && shareSetResult.data) {
      const { assetSets, productSets } = summarizeShareSets({
        rows: shareSetResult.data.rows,
        itemRows: shareSetResult.data.itemRows,
        grantRows: shareSetResult.data.grantRows,
      });
      let totalAssetSets = assetSets.length;
      let totalProductSets = productSets.length;
      try {
        const totals = await queryShareSetModuleTotals({
          organizationId: organization.id,
          moduleFilter,
        });
        if (totals.data) {
          totalAssetSets = totals.data.totalAssetSets;
          totalProductSets = totals.data.totalProductSets;
        }
      } catch (totalsError) {
        console.error("Error counting saved scopes by module:", totalsError);
      }

      const activeGrantCount = shareSetResult.data.grantRows.length;
      const sharedPartnerCount = new Set(
        shareSetResult.data.grantRows
          .map((row: PartnerShareSetGrantRow) => row.partner_organization_id)
          .filter((row: string | null): row is string => Boolean(row))
      ).size;

      return NextResponse.json({
        success: true,
        data: {
          asset_sets: assetSets,
          product_sets: productSets,
          asset_saved_scopes: assetSets,
          product_saved_scopes: productSets,
        },
        meta: {
          page,
          page_size: pageSize,
          total_asset_sets: totalAssetSets,
          total_product_sets: totalProductSets,
          total_sets: shareSetResult.data.total,
          total_active_grants: activeGrantCount,
          total_shared_partners: sharedPartnerCount,
        },
        capabilities: {
          product_sets_enabled: true,
          share_sets_v2: true,
        },
      });
    }

    if (!isMissingShareSetFoundationError(shareSetResult.error)) {
      return NextResponse.json(
        { error: "Failed to load saved scope summaries" },
        { status: 500 }
      );
    }

    if (moduleFilter === "products") {
      return NextResponse.json({
        success: true,
        data: {
          asset_sets: [],
          product_sets: [],
          asset_saved_scopes: [],
          product_saved_scopes: [],
        },
        meta: {
          page,
          page_size: pageSize,
          total_asset_sets: 0,
          total_product_sets: 0,
        },
        capabilities: {
          product_sets_enabled: false,
          share_sets_v2: false,
        },
      });
    }

    const legacyResult = await buildLegacyAssetSetSummaries({
      organizationId: organization.id,
      searchTerm,
      page,
      pageSize,
    });

    if (legacyResult.error || !legacyResult.data) {
      return NextResponse.json(
        { error: "Failed to load asset saved scopes" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
        data: {
          asset_sets: legacyResult.data.assetSets,
          product_sets: [],
          asset_saved_scopes: legacyResult.data.assetSets,
          product_saved_scopes: [],
        },
      meta: {
        page,
        page_size: pageSize,
        total_asset_sets: legacyResult.data.totalAssetSets,
        total_product_sets: 0,
      },
      capabilities: {
        product_sets_enabled: false,
        share_sets_v2: false,
      },
    });
  } catch (error) {
    console.error("Error in sharing sets GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/sharing/sets
// Creates a new saved scope header. Legacy route name is kept for compatibility.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const moduleValue = typeof body.module === "string" ? body.module.trim().toLowerCase() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : null;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json(
        { error: "name must be 120 characters or fewer" },
        { status: 400 }
      );
    }
    if (!isShareSetModule(moduleValue)) {
      return NextResponse.json(
        { error: "module must be one of: assets, products" },
        { status: 400 }
      );
    }

    const metadata =
      body && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

    const insertResult = await getSupabaseServer()
      .from("share_sets")
      .insert({
        organization_id: organization.id,
        module_key: moduleValue,
        name,
        description,
        metadata: metadata as Json,
        created_by: userId,
      })
      .select("id,module_key,name,description,created_at,updated_at")
      .single();

    if (insertResult.error) {
      if (isMissingShareSetFoundationError(insertResult.error) && moduleValue === "assets") {
        const legacyInsert = await getSupabaseServer()
          .from("dam_collections")
          .insert({
            organization_id: organization.id,
            name,
            asset_ids: [],
            folder_ids: [],
            created_by: userId,
          })
          .select("id,name,created_at,updated_at")
          .single();

        if (legacyInsert.error || !legacyInsert.data) {
          return NextResponse.json(
            { error: "Failed to create asset saved scope" },
            { status: 500 }
          );
        }

        await logSecurityEvent(getSupabaseServer(), {
          organizationId: organization.id,
          actorUserId: userId,
          action: "sharing.set.created",
          resourceType: "share_set",
          resourceId: legacyInsert.data.id,
          userAgent: request.headers.get("user-agent"),
          metadata: {
            module_key: "assets",
            legacy_collection_fallback: true,
            name,
          },
        });

        return NextResponse.json(
          {
            success: true,
            data: {
              id: legacyInsert.data.id,
              module_key: "assets",
              name: legacyInsert.data.name,
              description: null,
              created_at: legacyInsert.data.created_at || null,
              updated_at: legacyInsert.data.updated_at || null,
            },
            capabilities: {
              share_sets_v2: false,
            },
          },
          { status: 201 }
        );
      }

      if (insertResult.error.code === "23505") {
        return NextResponse.json(
          { error: "A saved scope with this name already exists for this module" },
          { status: 409 }
        );
      }

      return NextResponse.json({ error: "Failed to create saved scope" }, { status: 500 });
    }

    await logSecurityEvent(getSupabaseServer(), {
      organizationId: organization.id,
      actorUserId: userId,
      action: "sharing.set.created",
      resourceType: "share_set",
      resourceId: insertResult.data.id,
      userAgent: request.headers.get("user-agent"),
      metadata: {
        module_key: moduleValue,
        name,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: insertResult.data,
        capabilities: {
          share_sets_v2: true,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in sharing sets POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
