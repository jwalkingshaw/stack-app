import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  isMissingTableError,
  normalizeUuidArray,
  requireSharingManagerContext,
} from "../../../_shared";

type ShareSetModule = "assets" | "products";
type ShareSetItemResourceType = "asset" | "folder" | "product" | "variant";

type ShareSetRecord = {
  id: string;
  module_key: ShareSetModule;
};

type ShareSetItemInput = {
  resourceType: ShareSetItemResourceType;
  resourceId: string;
  includeDescendants?: boolean;
  marketIds?: string[];
  channelIds?: string[];
  localeIds?: string[];
  metadata?: Record<string, unknown>;
};

type ScopeConstraintSummary = {
  marketIds: string[];
  channelIds: string[];
  localeIds: string[];
};

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

function normalizeResourceType(value: unknown): ShareSetItemResourceType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "asset" ||
    normalized === "folder" ||
    normalized === "product" ||
    normalized === "variant"
  ) {
    return normalized;
  }
  return null;
}

function normalizeItems(value: unknown): ShareSetItemInput[] {
  if (!Array.isArray(value)) return [];

  const out: ShareSetItemInput[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const resourceType = normalizeResourceType(item.resourceType);
    const resourceId =
      typeof item.resourceId === "string" ? item.resourceId.trim() : "";
    if (!resourceType || !resourceId) continue;

    out.push({
      resourceType,
      resourceId,
      includeDescendants: Boolean(item.includeDescendants),
      marketIds: normalizeUuidArray(item.marketIds),
      channelIds: normalizeUuidArray(item.channelIds),
      localeIds: normalizeUuidArray(item.localeIds),
      metadata:
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {},
    });
  }

  return out;
}

function collectConstraintIds(items: ShareSetItemInput[]): ScopeConstraintSummary {
  const marketIds = new Set<string>();
  const channelIds = new Set<string>();
  const localeIds = new Set<string>();

  for (const item of items) {
    for (const id of item.marketIds || []) marketIds.add(id);
    for (const id of item.channelIds || []) channelIds.add(id);
    for (const id of item.localeIds || []) localeIds.add(id);
  }

  return {
    marketIds: Array.from(marketIds),
    channelIds: Array.from(channelIds),
    localeIds: Array.from(localeIds),
  };
}

async function validateScopedContainerIds(params: {
  organizationId: string;
  items: ShareSetItemInput[];
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { organizationId, items } = params;
  const constraints = collectConstraintIds(items);

  const checks: Array<{ key: keyof ScopeConstraintSummary; table: string; label: string }> = [
    { key: "marketIds", table: "markets", label: "marketIds" },
    { key: "channelIds", table: "channels", label: "channelIds" },
    { key: "localeIds", table: "locales", label: "localeIds" },
  ];

  for (const check of checks) {
    const ids = constraints[check.key];
    if (ids.length === 0) continue;

    const { data, error } = await (supabaseServer as any)
      .from(check.table)
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", ids);

    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          status: 503,
          error: `Cannot validate ${check.label}: required ${check.table} table is unavailable.`,
        };
      }
      return {
        ok: false,
        status: 500,
        error: `Failed to validate ${check.label}`,
      };
    }

    if ((data || []).length !== ids.length) {
      return {
        ok: false,
        status: 400,
        error: `One or more ${check.label} entries are invalid for this organization`,
      };
    }
  }

  return { ok: true };
}

async function getShareSet(params: {
  organizationId: string;
  setId: string;
}): Promise<
  | { ok: true; data: ShareSetRecord }
  | { ok: false; status: number; error: string }
> {
  const { organizationId, setId } = params;

  const { data, error } = await (supabaseServer as any)
    .from("share_sets")
    .select("id,module_key")
    .eq("id", setId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    if (error?.code === "PGRST205" || error?.code === "42P01") {
      return {
        ok: false,
        status: 503,
        error: "Share set foundation tables are unavailable. Apply database migrations first.",
      };
    }
    return { ok: false, status: 500, error: "Failed to resolve share set" };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Share set not found" };
  }

  return { ok: true, data: data as ShareSetRecord };
}

async function validateItemOwnership(params: {
  organizationId: string;
  moduleKey: ShareSetModule;
  items: ShareSetItemInput[];
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { organizationId, moduleKey, items } = params;

  if (moduleKey === "assets") {
    const invalidType = items.find(
      (item) => item.resourceType !== "asset" && item.resourceType !== "folder"
    );
    if (invalidType) {
      return {
        ok: false,
        status: 400,
        error: "Asset share sets only accept resourceType asset or folder",
      };
    }

    const assetIds = Array.from(
      new Set(
        items
          .filter((item) => item.resourceType === "asset")
          .map((item) => item.resourceId)
      )
    );
    const folderIds = Array.from(
      new Set(
        items
          .filter((item) => item.resourceType === "folder")
          .map((item) => item.resourceId)
      )
    );

    if (assetIds.length > 0) {
      const { data, error } = await (supabaseServer as any)
        .from("dam_assets")
        .select("id")
        .eq("organization_id", organizationId)
        .in("id", assetIds);
      if (error) {
        return { ok: false, status: 500, error: "Failed to validate asset selection" };
      }
      if ((data || []).length !== assetIds.length) {
        return { ok: false, status: 400, error: "One or more assets are invalid" };
      }
    }

    if (folderIds.length > 0) {
      const { data, error } = await (supabaseServer as any)
        .from("dam_folders")
        .select("id")
        .eq("organization_id", organizationId)
        .in("id", folderIds);
      if (error) {
        return { ok: false, status: 500, error: "Failed to validate folder selection" };
      }
      if ((data || []).length !== folderIds.length) {
        return { ok: false, status: 400, error: "One or more folders are invalid" };
      }
    }

    return { ok: true };
  }

  const invalidType = items.find(
    (item) => item.resourceType !== "product" && item.resourceType !== "variant"
  );
  if (invalidType) {
    return {
      ok: false,
      status: 400,
      error: "Product share sets only accept resourceType product or variant",
    };
  }

  const productIds = Array.from(new Set(items.map((item) => item.resourceId)));
  if (productIds.length === 0) {
    return { ok: true };
  }

  const { data, error } = await (supabaseServer as any)
    .from("products")
    .select("id,type")
    .eq("organization_id", organizationId)
    .in("id", productIds);

  if (error) {
    return { ok: false, status: 500, error: "Failed to validate product selection" };
  }

  const productRows = (data || []) as Array<{ id: string; type: string }>;
  if (productRows.length !== productIds.length) {
    return { ok: false, status: 400, error: "One or more products are invalid" };
  }

  const typeById = new Map<string, string>();
  for (const row of productRows) {
    typeById.set(row.id, row.type);
  }

  for (const item of items) {
    const productType = typeById.get(item.resourceId);
    if (!productType) {
      return { ok: false, status: 400, error: "One or more products are invalid" };
    }
    if (item.resourceType === "variant" && productType !== "variant") {
      return {
        ok: false,
        status: 400,
        error: "resourceType variant can only reference products with type=variant",
      };
    }
    if (item.resourceType === "product" && productType === "variant") {
      return {
        ok: false,
        status: 400,
        error: "resourceType product cannot reference variant rows",
      };
    }
  }

  return { ok: true };
}

// GET /api/[tenant]/sharing/sets/[setId]/items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const shareSet = await getShareSet({
      organizationId: organization.id,
      setId: resolvedParams.setId,
    });
    if (!shareSet.ok) {
      return NextResponse.json({ error: shareSet.error }, { status: shareSet.status });
    }

    const url = new URL(request.url);
    const limit = parsePositiveInt(url.searchParams.get("limit"), 200, 1000);

    const { data, error } = await (supabaseServer as any)
      .from("share_set_items")
      .select(
        "id,resource_type,resource_id,include_descendants,market_ids,channel_ids,locale_ids,metadata,created_at,updated_at"
      )
      .eq("organization_id", organization.id)
      .eq("share_set_id", shareSet.data.id)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: "Failed to load share set items" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        set_id: shareSet.data.id,
        module_key: shareSet.data.module_key,
        items: data || [],
      },
      meta: {
        limit,
      },
    });
  } catch (error) {
    console.error("Error in share set items GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/sharing/sets/[setId]/items
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;
    const shareSet = await getShareSet({
      organizationId: organization.id,
      setId: resolvedParams.setId,
    });
    if (!shareSet.ok) {
      return NextResponse.json({ error: shareSet.error }, { status: shareSet.status });
    }

    const body = await request.json().catch(() => ({}));
    const items = normalizeItems(body.items);
    if (items.length === 0) {
      return NextResponse.json({ error: "items is required" }, { status: 400 });
    }
    if (items.length > 500) {
      return NextResponse.json({ error: "Maximum 500 items per request" }, { status: 400 });
    }

    const validation = await validateItemOwnership({
      organizationId: organization.id,
      moduleKey: shareSet.data.module_key,
      items,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const scopeValidation = await validateScopedContainerIds({
      organizationId: organization.id,
      items,
    });
    if (!scopeValidation.ok) {
      return NextResponse.json(
        { error: scopeValidation.error },
        { status: scopeValidation.status }
      );
    }

    const records = items.map((item) => ({
      share_set_id: shareSet.data.id,
      organization_id: organization.id,
      resource_type: item.resourceType,
      resource_id: item.resourceId,
      include_descendants: Boolean(item.includeDescendants),
      market_ids: item.marketIds || [],
      channel_ids: item.channelIds || [],
      locale_ids: item.localeIds || [],
      metadata: item.metadata || {},
      created_by: userId,
    }));

    const { data, error } = await (supabaseServer as any)
      .from("share_set_items")
      .upsert(records, {
        onConflict: "share_set_id,resource_type,resource_id",
      })
      .select("id,resource_type,resource_id,include_descendants,updated_at");

    if (error) {
      return NextResponse.json({ error: "Failed to upsert share set items" }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        data: data || [],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in share set items POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/sharing/sets/[setId]/items
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const shareSet = await getShareSet({
      organizationId: organization.id,
      setId: resolvedParams.setId,
    });
    if (!shareSet.ok) {
      return NextResponse.json({ error: shareSet.error }, { status: shareSet.status });
    }

    const body = await request.json().catch(() => ({}));
    const items = normalizeItems(body.items);
    if (items.length === 0) {
      return NextResponse.json({ error: "items is required" }, { status: 400 });
    }

    const deletesByType = new Map<ShareSetItemResourceType, string[]>();
    for (const item of items) {
      const list = deletesByType.get(item.resourceType) || [];
      list.push(item.resourceId);
      deletesByType.set(item.resourceType, list);
    }

    const deleteOps = Array.from(deletesByType.entries()).map(([resourceType, ids]) => {
      const uniqueIds = Array.from(new Set(ids));
      return (supabaseServer as any)
        .from("share_set_items")
        .delete()
        .eq("organization_id", organization.id)
        .eq("share_set_id", shareSet.data.id)
        .eq("resource_type", resourceType)
        .in("resource_id", uniqueIds);
    });

    const results = await Promise.all(deleteOps);
    const failed = results.find((result) => Boolean(result.error));
    if (failed?.error) {
      return NextResponse.json({ error: "Failed to remove share set items" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in share set items DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
