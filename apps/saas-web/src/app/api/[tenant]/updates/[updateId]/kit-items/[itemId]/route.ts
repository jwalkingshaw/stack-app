import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  normalizeJsonObject,
  normalizeOptionalString,
  normalizeUuidArray,
  requireUpdatesContext,
} from "../../../_shared";

async function ensureKitItem(params: {
  organizationId: string;
  updateId: string;
  itemId: string;
}) {
  const { data, error } = await supabaseServer
    .from("partner_update_kit_items")
    .select("id,item_type")
    .eq("organization_id", params.organizationId)
    .eq("partner_update_id", params.updateId)
    .eq("id", params.itemId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, status: 500, error: "Failed to resolve kit item" };
  }
  if (!data) {
    return { ok: false as const, status: 404, error: "Kit item not found" };
  }
  return {
    ok: true as const,
    item: {
      id: String(data.id),
      itemType: String(data.item_type).toLowerCase(),
    },
  };
}

async function validateReferencedResource(params: {
  organizationId: string;
  itemType: string;
  productId?: string | null;
  assetId?: string | null;
}) {
  const { organizationId, itemType } = params;
  if (itemType === "product") {
    const productId = params.productId ? String(params.productId).trim() : "";
    if (!productId) {
      return { ok: false as const, status: 400, error: "productId cannot be empty" };
    }
    const { data, error } = await supabaseServer
      .from("products")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", productId)
      .maybeSingle();
    if (error) {
      return { ok: false as const, status: 500, error: "Failed to validate product reference" };
    }
    if (!data) {
      return { ok: false as const, status: 400, error: "productId is invalid for this workspace" };
    }
    return { ok: true as const };
  }

  if (itemType === "asset") {
    const assetId = params.assetId ? String(params.assetId).trim() : "";
    if (!assetId) {
      return { ok: false as const, status: 400, error: "assetId cannot be empty" };
    }
    const { data, error } = await supabaseServer
      .from("dam_assets")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", assetId)
      .maybeSingle();
    if (error) {
      return { ok: false as const, status: 500, error: "Failed to validate asset reference" };
    }
    if (!data) {
      return { ok: false as const, status: 400, error: "assetId is invalid for this workspace" };
    }
    return { ok: true as const };
  }

  return { ok: true as const };
}

// PATCH /api/[tenant]/updates/[updateId]/kit-items/[itemId]
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ tenant: string; updateId: string; itemId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant, {
      requireManager: true,
    });
    if (!access.ok) return access.response;

    const existing = await ensureKitItem({
      organizationId: access.context.organizationId,
      updateId: resolvedParams.updateId,
      itemId: resolvedParams.itemId,
    });
    if (!existing.ok) {
      return NextResponse.json({ error: existing.error }, { status: existing.status });
    }

    const body = await request.json().catch(() => ({}));
    const updatePayload: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      updatePayload.title = normalizeOptionalString(body.title);
    }
    if (Object.prototype.hasOwnProperty.call(body, "description")) {
      updatePayload.description = normalizeOptionalString(body.description);
    }
    if (Object.prototype.hasOwnProperty.call(body, "sortOrder") || Object.prototype.hasOwnProperty.call(body, "sort_order")) {
      const value = Number(body.sortOrder ?? body.sort_order);
      if (!Number.isFinite(value) || value < 0) {
        return NextResponse.json({ error: "sortOrder must be a non-negative integer" }, { status: 400 });
      }
      updatePayload.sort_order = Math.floor(value);
    }
    if (Object.prototype.hasOwnProperty.call(body, "marketIds") || Object.prototype.hasOwnProperty.call(body, "market_ids")) {
      updatePayload.market_ids = normalizeUuidArray(body.marketIds ?? body.market_ids);
    }
    if (Object.prototype.hasOwnProperty.call(body, "channelIds") || Object.prototype.hasOwnProperty.call(body, "channel_ids")) {
      updatePayload.channel_ids = normalizeUuidArray(body.channelIds ?? body.channel_ids);
    }
    if (Object.prototype.hasOwnProperty.call(body, "localeIds") || Object.prototype.hasOwnProperty.call(body, "locale_ids")) {
      updatePayload.locale_ids = normalizeUuidArray(body.localeIds ?? body.locale_ids);
    }
    if (Object.prototype.hasOwnProperty.call(body, "metadata")) {
      updatePayload.metadata = normalizeJsonObject(body.metadata);
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "contentJson") ||
      Object.prototype.hasOwnProperty.call(body, "content_json")
    ) {
      if (existing.item.itemType !== "text") {
        return NextResponse.json(
          { error: "contentJson can only be updated for text itemType" },
          { status: 400 }
        );
      }
      const contentJson = normalizeJsonObject(body.contentJson ?? body.content_json);
      if (Object.keys(contentJson).length === 0) {
        return NextResponse.json(
          { error: "text contentJson cannot be empty" },
          { status: 400 }
        );
      }
      updatePayload.content_json = contentJson;
    }

    if (Object.prototype.hasOwnProperty.call(body, "url")) {
      if (existing.item.itemType !== "url") {
        return NextResponse.json(
          { error: "url can only be updated for url itemType" },
          { status: 400 }
        );
      }
      const url = normalizeOptionalString(body.url);
      if (!url) {
        return NextResponse.json({ error: "url cannot be empty" }, { status: 400 });
      }
      updatePayload.url = url;
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "productId") ||
      Object.prototype.hasOwnProperty.call(body, "product_id")
    ) {
      if (existing.item.itemType !== "product") {
        return NextResponse.json(
          { error: "productId can only be updated for product itemType" },
          { status: 400 }
        );
      }
      const productId = normalizeOptionalString(body.productId ?? body.product_id);
      if (!productId) {
        return NextResponse.json({ error: "productId cannot be empty" }, { status: 400 });
      }
      const validation = await validateReferencedResource({
        organizationId: access.context.organizationId,
        itemType: "product",
        productId,
      });
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: validation.status });
      }
      updatePayload.product_id = productId;
      updatePayload.asset_id = null;
      updatePayload.url = null;
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "assetId") ||
      Object.prototype.hasOwnProperty.call(body, "asset_id")
    ) {
      if (existing.item.itemType !== "asset") {
        return NextResponse.json(
          { error: "assetId can only be updated for asset itemType" },
          { status: 400 }
        );
      }
      const assetId = normalizeOptionalString(body.assetId ?? body.asset_id);
      if (!assetId) {
        return NextResponse.json({ error: "assetId cannot be empty" }, { status: 400 });
      }
      const validation = await validateReferencedResource({
        organizationId: access.context.organizationId,
        itemType: "asset",
        assetId,
      });
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: validation.status });
      }
      updatePayload.asset_id = assetId;
      updatePayload.product_id = null;
      updatePayload.url = null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No mutable fields provided" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("partner_update_kit_items")
      .update(updatePayload)
      .eq("organization_id", access.context.organizationId)
      .eq("partner_update_id", resolvedParams.updateId)
      .eq("id", resolvedParams.itemId)
      .select(
        "id,item_type,product_id,asset_id,url,title,description,content_json,sort_order,market_ids,channel_ids,locale_ids,metadata,created_by,created_at,updated_at"
      )
      .maybeSingle();

    if (error) {
      console.error("Error updating kit item:", error);
      return NextResponse.json({ error: "Failed to update kit item" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Kit item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in kit item PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/updates/[updateId]/kit-items/[itemId]
export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ tenant: string; updateId: string; itemId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireUpdatesContext(request, resolvedParams.tenant, {
      requireManager: true,
    });
    if (!access.ok) return access.response;

    const { data, error } = await supabaseServer
      .from("partner_update_kit_items")
      .delete()
      .eq("organization_id", access.context.organizationId)
      .eq("partner_update_id", resolvedParams.updateId)
      .eq("id", resolvedParams.itemId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Error deleting kit item:", error);
      return NextResponse.json({ error: "Failed to delete kit item" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Kit item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in kit item DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
