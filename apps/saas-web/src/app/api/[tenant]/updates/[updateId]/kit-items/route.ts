import { NextRequest, NextResponse } from "next/server";
import type { Database, Json } from "@stack-app/database";
import { supabaseServer } from "@/lib/supabase";
import {
  normalizeJsonObject,
  normalizeOptionalString,
  normalizeUuidArray,
  requireUpdatesContext,
} from "../../_shared";

type KitItemType = "product" | "asset" | "url" | "text" | "email" | "social";

type NormalizedKitItem = {
  itemType: KitItemType;
  productId: string | null;
  assetId: string | null;
  url: string | null;
  title: string | null;
  description: string | null;
  contentJson: Record<string, unknown>;
  sortOrder: number;
  marketIds: string[];
  channelIds: string[];
  localeIds: string[];
  metadata: Record<string, unknown>;
};

function normalizeKitItem(entry: unknown): {
  ok: true;
  item: NormalizedKitItem;
} | {
  ok: false;
  error: string;
} {
  if (!entry || typeof entry !== "object") {
    return { ok: false, error: "Each kit item must be an object" };
  }

  const payload = entry as Record<string, unknown>;
  const itemTypeRaw = normalizeOptionalString(payload.itemType || payload.item_type)?.toLowerCase();
  if (
    itemTypeRaw !== "product" &&
    itemTypeRaw !== "asset" &&
    itemTypeRaw !== "url" &&
    itemTypeRaw !== "text" &&
    itemTypeRaw !== "email" &&
    itemTypeRaw !== "social"
  ) {
    return { ok: false, error: "itemType must be one of: product, asset, url, text, email, social" };
  }

  const productId = normalizeOptionalString(payload.productId || payload.product_id);
  const assetId = normalizeOptionalString(payload.assetId || payload.asset_id);
  const url = normalizeOptionalString(payload.url);
  const contentJson = normalizeJsonObject(payload.contentJson || payload.content_json);

  if (itemTypeRaw === "product" && !productId) {
    return { ok: false, error: "product itemType requires productId" };
  }
  if (itemTypeRaw === "asset" && !assetId) {
    return { ok: false, error: "asset itemType requires assetId" };
  }
  if (itemTypeRaw === "url" && !url) {
    return { ok: false, error: "url itemType requires url" };
  }
  if ((itemTypeRaw === "text" || itemTypeRaw === "email" || itemTypeRaw === "social") && Object.keys(contentJson).length === 0) {
    return { ok: false, error: `${itemTypeRaw} itemType requires non-empty contentJson` };
  }

  const sortOrderRaw = Number(payload.sortOrder ?? payload.sort_order ?? 100);
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.max(0, Math.floor(sortOrderRaw)) : 100;

  return {
    ok: true,
    item: {
      itemType: itemTypeRaw,
      productId: itemTypeRaw === "product" ? productId : null,
      assetId: itemTypeRaw === "asset" ? assetId : null,
      url: itemTypeRaw === "url" ? url : null,
      title: normalizeOptionalString(payload.title),
      description: normalizeOptionalString(payload.description),
      contentJson: (itemTypeRaw === "text" || itemTypeRaw === "email" || itemTypeRaw === "social") ? contentJson : {},
      sortOrder,
      marketIds: normalizeUuidArray(payload.marketIds ?? payload.market_ids),
      channelIds: normalizeUuidArray(payload.channelIds ?? payload.channel_ids),
      localeIds: normalizeUuidArray(payload.localeIds ?? payload.locale_ids),
      metadata: normalizeJsonObject(payload.metadata),
    },
  };
}

async function ensureUpdateExists(params: {
  organizationId: string;
  updateId: string;
}) {
  const { organizationId, updateId } = params;
  const { data, error } = await supabaseServer
    .from("partner_updates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", updateId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, status: 500, error: "Failed to resolve update" };
  }
  if (!data) {
    return { ok: false as const, status: 404, error: "Partner update not found" };
  }
  return { ok: true as const };
}

async function validateReferencedResources(params: {
  organizationId: string;
  items: NormalizedKitItem[];
}) {
  const productIds = Array.from(
    new Set(params.items.map((item) => item.productId).filter((id): id is string => Boolean(id)))
  );
  const assetIds = Array.from(
    new Set(params.items.map((item) => item.assetId).filter((id): id is string => Boolean(id)))
  );

  if (productIds.length > 0) {
    const { data, error } = await supabaseServer
      .from("products")
      .select("id")
      .eq("organization_id", params.organizationId)
      .in("id", productIds);
    if (error) {
      return { ok: false as const, status: 500, error: "Failed to validate product references" };
    }
    if ((data || []).length !== productIds.length) {
      return { ok: false as const, status: 400, error: "One or more productIds are invalid for this workspace" };
    }
  }

  if (assetIds.length > 0) {
    const { data, error } = await supabaseServer
      .from("dam_assets")
      .select("id,asset_scope")
      .eq("organization_id", params.organizationId)
      .in("id", assetIds);
    if (error) {
      return { ok: false as const, status: 500, error: "Failed to validate asset references" };
    }
    const rows = (data || []) as Array<{ id: string; asset_scope: string | null }>;
    if (rows.length !== assetIds.length) {
      return { ok: false as const, status: 400, error: "One or more assetIds are invalid for this workspace" };
    }
    const internalAsset = rows.find(
      (row) => !row.asset_scope || row.asset_scope.toLowerCase() === "internal"
    );
    if (internalAsset) {
      return {
        ok: false as const,
        status: 400,
        error: "Internal assets cannot be added to a kit. Change the asset visibility to Shared first.",
      };
    }
  }

  return { ok: true as const };
}

// GET /api/[tenant]/updates/[updateId]/kit-items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; updateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const exists = await ensureUpdateExists({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
    });
    if (!exists.ok) {
      return NextResponse.json({ error: exists.error }, { status: exists.status });
    }

    const { data, error } = await supabaseServer
      .from("partner_update_kit_items")
      .select(
        "id,item_type,product_id,asset_id,url,title,description,content_json,sort_order,market_ids,channel_ids,locale_ids,metadata,created_by,created_at,updated_at"
      )
      .eq("organization_id", access.context.organizationId)
      .eq("partner_update_id", resolvedParams.updateId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading update kit items:", error);
      return NextResponse.json({ error: "Failed to load kit items" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("Error in update kit-items GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/updates/[updateId]/kit-items
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; updateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant, {
      requireManager: true,
    });
    if (!access.ok) return access.response;

    const exists = await ensureUpdateExists({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
    });
    if (!exists.ok) {
      return NextResponse.json({ error: exists.error }, { status: exists.status });
    }

    const body = await request.json().catch(() => ({}));
    const entries = Array.isArray(body.items) ? body.items : [body];
    if (entries.length === 0) {
      return NextResponse.json({ error: "items is required" }, { status: 400 });
    }

    const normalized: NormalizedKitItem[] = [];
    for (const entry of entries) {
      const parsed = normalizeKitItem(entry);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      normalized.push(parsed.item);
    }

    const refsValidation = await validateReferencedResources({
      organizationId: access.context.organizationId,
      items: normalized,
    });
    if (!refsValidation.ok) {
      return NextResponse.json({ error: refsValidation.error }, { status: refsValidation.status });
    }

    const insertRows: Database["public"]["Tables"]["partner_update_kit_items"]["Insert"][] = normalized.map((item) => ({
      organization_id: access.context.organizationId,
      partner_update_id: resolvedParams.updateId,
      item_type: item.itemType,
      product_id: item.productId,
      asset_id: item.assetId,
      url: item.url,
      title: item.title,
      description: item.description,
      content_json: item.contentJson as Json,
      sort_order: item.sortOrder,
      market_ids: item.marketIds,
      channel_ids: item.channelIds,
      locale_ids: item.localeIds,
      metadata: item.metadata as Json,
      created_by: access.context.userId,
    }));

    const { data, error } = await supabaseServer
      .from("partner_update_kit_items")
      .insert(insertRows)
      .select(
        "id,item_type,product_id,asset_id,url,title,description,content_json,sort_order,market_ids,channel_ids,locale_ids,metadata,created_by,created_at,updated_at"
      );

    if (error) {
      console.error("Error creating update kit items:", error);
      return NextResponse.json({ error: "Failed to create kit items" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] }, { status: 201 });
  } catch (error) {
    console.error("Error in update kit-items POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
