import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
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

function isMissingShareSetFoundationError(error: any): boolean {
  if (!error) return false;
  if (isMissingTableError(error)) return true;
  if (error?.code === "PGRST205") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("share_sets") ||
    message.includes("share_set_items") ||
    message.includes("partner_share_set_grants")
  );
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

  let withFolders = (supabaseServer as any)
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

  let withoutFolders = (supabaseServer as any)
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

  let query = (supabaseServer as any)
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

  const [itemResult, grantResult] = await Promise.all([
    (supabaseServer as any)
      .from("share_set_items")
      .select("share_set_id,resource_type,market_ids,channel_ids,locale_ids")
      .eq("organization_id", organizationId)
      .in("share_set_id", setIds),
    (supabaseServer as any)
      .from("partner_share_set_grants")
      .select("share_set_id,partner_organization_id,status")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("share_set_id", setIds),
  ]);

  if (itemResult.error) {
    return { data: null, error: itemResult.error };
  }
  if (grantResult.error) {
    return { data: null, error: grantResult.error };
  }

  return {
    data: {
      rows: setRows,
      itemRows: (itemResult.data || []) as ShareSetItemRow[],
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
  const { count, error } = await (supabaseServer as any)
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
      };

    const marketIds = dedupeStringArray(row.market_ids);
    const channelIds = dedupeStringArray(row.channel_ids);
    const localeIds = dedupeStringArray(row.locale_ids);

    if (row.resource_type === "asset") current.asset += 1;
    if (row.resource_type === "folder") current.folder += 1;
    if (row.resource_type === "product") current.product += 1;
    if (row.resource_type === "variant") current.variant += 1;
    current.total += 1;
    if (marketIds.length > 0 || channelIds.length > 0 || localeIds.length > 0) {
      current.scoped += 1;
    }
    for (const id of marketIds) current.marketIds.add(id);
    for (const id of channelIds) current.channelIds.add(id);
    for (const id of localeIds) current.localeIds.add(id);
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
    const { data: grants, error: grantsError } = await (supabaseServer as any)
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

// GET /api/[tenant]/sharing/sets
// Scalable "set catalog" endpoint: returns summary-only rows (counts, no full item payloads).
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
        console.error("Error counting share sets by module:", totalsError);
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
        { error: "Failed to load share set summaries" },
        { status: 500 }
      );
    }

    if (moduleFilter === "products") {
      return NextResponse.json({
        success: true,
        data: {
          asset_sets: [],
          product_sets: [],
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
        { error: "Failed to load asset share sets" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        asset_sets: legacyResult.data.assetSets,
        product_sets: [],
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
// Creates a new share set header. Item membership is handled by dedicated module APIs.
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

    const insertResult = await (supabaseServer as any)
      .from("share_sets")
      .insert({
        organization_id: organization.id,
        module_key: moduleValue,
        name,
        description,
        metadata,
        created_by: userId,
      })
      .select("id,module_key,name,description,created_at,updated_at")
      .single();

    if (insertResult.error) {
      if (isMissingShareSetFoundationError(insertResult.error) && moduleValue === "assets") {
        const legacyInsert = await (supabaseServer as any)
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
            { error: "Failed to create asset share set" },
            { status: 500 }
          );
        }

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
          { error: "A share set with this name already exists for this module" },
          { status: 409 }
        );
      }

      return NextResponse.json({ error: "Failed to create share set" }, { status: 500 });
    }

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
