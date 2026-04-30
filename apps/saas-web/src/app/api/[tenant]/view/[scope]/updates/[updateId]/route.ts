import { NextRequest, NextResponse } from "next/server";
import {
  resolvePartnerGrantedAssetIds,
  resolvePartnerGrantedProductIds,
} from "@/lib/partner-brand-view";
import { getSupabaseServer } from "@/lib/supabase";
import {
  appendUpdateActivity,
  markRecipientsNotified,
} from "../../../../updates/_delivery";
import {
  ensurePartnerUpdateRecipient,
  requirePartnerUpdatesScopeContext,
} from "../_shared";

async function loadKitItems(params: {
  organizationId: string;
  updateId: string;
  partnerOrganizationId: string;
}) {
  const { data, error } = await getSupabaseServer()
    .from("partner_update_kit_items")
    .select(
      "id,item_type,product_id,asset_id,url,title,description,content_json,sort_order,market_ids,channel_ids,locale_ids,metadata,created_at,updated_at"
    )
    .eq("organization_id", params.organizationId)
    .eq("partner_update_id", params.updateId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false as const, status: 500, error: "Failed to load kit items" };
  }

  const items = (data || []) as Array<Record<string, unknown>>;
  const [grantedProducts, grantedAssets] = await Promise.all([
    resolvePartnerGrantedProductIds({
      brandOrganizationId: params.organizationId,
      partnerOrganizationId: params.partnerOrganizationId,
    }),
    resolvePartnerGrantedAssetIds({
      brandOrganizationId: params.organizationId,
      partnerOrganizationId: params.partnerOrganizationId,
    }),
  ]);

  if (!grantedProducts.foundationAvailable || !grantedAssets.foundationAvailable) {
    return {
      ok: false as const,
      status: 503,
      error: "Share Set visibility foundation is unavailable. Apply latest sharing migrations first.",
    };
  }

  const grantedProductIds = new Set(grantedProducts.productIds);
  const grantedAssetIds = new Set(grantedAssets.assetIds);
  const transformedItems: Array<Record<string, unknown>> = items.map((row): Record<string, unknown> => {
    const itemType = typeof row.item_type === "string" ? row.item_type : "";
    const productId = typeof row.product_id === "string" ? row.product_id : null;
    const assetId = typeof row.asset_id === "string" ? row.asset_id : null;

    const productRestricted =
      itemType === "product" && productId && !grantedProductIds.has(productId);
    const assetRestricted =
      itemType === "asset" && assetId && !grantedAssetIds.has(assetId);

    if (!productRestricted && !assetRestricted) {
      return {
        ...row,
        is_available: true,
        unavailable_reason: null,
        unavailable_message: null,
      };
    }

    const unavailableMessage = productRestricted
      ? "This product is unavailable for your current access."
      : "This asset is unavailable for your current access.";

    return {
      ...row,
      is_available: false,
      product_id: productRestricted ? null : productId,
      asset_id: assetRestricted ? null : assetId,
      unavailable_reason: productRestricted ? "product_access_denied" : "asset_access_denied",
      unavailable_message: unavailableMessage,
    };
  });

  // Resolve product names and asset filenames for display
  const productIds = Array.from(
    new Set(
      transformedItems
        .map((r) => r.product_id)
        .filter((id): id is string => typeof id === "string" && Boolean(id))
    )
  );
  const assetIds = Array.from(
    new Set(
      transformedItems
        .map((r) => r.asset_id)
        .filter((id): id is string => typeof id === "string" && Boolean(id))
    )
  );

  const productLookup: Record<string, { name: string | null; sku: string | null; type: string | null }> = {};
  if (productIds.length > 0) {
    const { data: productRows } = await getSupabaseServer()
      .from("products")
      .select("id,product_name,sku,type")
      .eq("organization_id", params.organizationId)
      .in("id", productIds);
    for (const row of (productRows || []) as Array<Record<string, unknown>>) {
      const id = String(row.id || "");
      if (!id) continue;
      productLookup[id] = {
        name: typeof row.product_name === "string" ? row.product_name : null,
        sku: typeof row.sku === "string" ? row.sku : null,
        type: typeof row.type === "string" ? row.type : null,
      };
    }
  }

  const assetLookup: Record<string, { filename: string | null; fileType: string | null; mimeType: string | null }> = {};
  if (assetIds.length > 0) {
    const { data: assetRows } = await getSupabaseServer()
      .from("dam_assets")
      .select("id,original_filename,file_type,mime_type")
      .eq("organization_id", params.organizationId)
      .in("id", assetIds);
    for (const row of (assetRows || []) as Array<Record<string, unknown>>) {
      const id = String(row.id || "");
      if (!id) continue;
      assetLookup[id] = {
        filename: typeof row.original_filename === "string" ? row.original_filename : null,
        fileType: typeof row.file_type === "string" ? row.file_type : null,
        mimeType: typeof row.mime_type === "string" ? row.mime_type : null,
      };
    }
  }

  return {
    ok: true as const,
    items: transformedItems,
    productLookup,
    assetLookup,
  };
}

// GET /api/[tenant]/view/[scope]/updates/[updateId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; scope: string; updateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const scopeAccess = await requirePartnerUpdatesScopeContext({
      request,
      tenantSlug: resolvedParams.tenant,
      scope: resolvedParams.scope,
    });
    if (!scopeAccess.ok) return scopeAccess.response;

    const recipientResult = await ensurePartnerUpdateRecipient({
      updateId: resolvedParams.updateId,
      partnerOrganizationId: scopeAccess.partnerOrganizationId,
      allowedBrandOrganizationIds: scopeAccess.allowedBrandOrganizationIds,
    });
    if (!recipientResult.ok) {
      return NextResponse.json(
        { error: recipientResult.error },
        { status: recipientResult.status }
      );
    }

    const recipient = recipientResult.recipient;
    const { data: update, error: updateError } = await getSupabaseServer()
      .from("partner_updates")
      .select(
        "id,organization_id,title,summary,urgency,status,event_label,labels,message_json,due_at,published_at,scheduled_for,metadata,updated_at"
      )
      .eq("organization_id", recipient.organizationId)
      .eq("id", resolvedParams.updateId)
      .eq("status", "published")
      .maybeSingle();

    if (updateError) {
      console.error("Failed to load update detail for partner view:", updateError);
      return NextResponse.json({ error: "Failed to load update" }, { status: 500 });
    }
    if (!update) {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }

    const kitItemsResult = await loadKitItems({
      organizationId: recipient.organizationId,
      updateId: resolvedParams.updateId,
      partnerOrganizationId: scopeAccess.partnerOrganizationId,
    });
    if (!kitItemsResult.ok) {
      return NextResponse.json({ error: kitItemsResult.error }, { status: kitItemsResult.status });
    }

    const { data: organizationRow } = await getSupabaseServer()
      .from("organizations")
      .select("id,name,slug")
      .eq("id", recipient.organizationId)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    if (!recipient.openedAt) {
      const nextStatus =
        recipient.status === "queued" || recipient.status === "notified"
          ? "opened"
          : recipient.status;

      const { error: updateRecipientError } = await getSupabaseServer()
        .from("partner_update_recipients")
        .update({
          status: nextStatus,
          opened_at: nowIso,
        })
        .eq("id", recipient.id);

      if (!updateRecipientError) {
        await appendUpdateActivity({
          organizationId: recipient.organizationId,
          updateId: resolvedParams.updateId,
          actorUserId: scopeAccess.userId,
          rows: [
            {
              partnerOrganizationId: scopeAccess.partnerOrganizationId,
              eventType: "opened",
              metadata: {
                source: "detail_view",
              },
              eventAt: nowIso,
            },
          ],
        });
        await markRecipientsNotified({
          organizationId: recipient.organizationId,
          updateId: resolvedParams.updateId,
          partnerOrganizationIds: [scopeAccess.partnerOrganizationId],
        });
      }
    }

    const isActionable = kitItemsResult.items.length > 0;
    return NextResponse.json({
      success: true,
      data: {
        update: {
          id: String(update.id),
          organizationId: String(update.organization_id),
          title: String(update.title || ""),
          summary: update.summary ? String(update.summary) : null,
          urgency: String(update.urgency || "normal"),
          status: String(update.status || "published"),
          eventLabel: update.event_label ? String(update.event_label) : null,
          labels: Array.isArray(update.labels) ? update.labels : [],
          messageJson:
            update.message_json &&
            typeof update.message_json === "object" &&
            !Array.isArray(update.message_json)
              ? update.message_json
              : {},
          dueAt: update.due_at ? String(update.due_at) : null,
          publishedAt: update.published_at ? String(update.published_at) : null,
          scheduledFor: update.scheduled_for ? String(update.scheduled_for) : null,
          metadata:
            update.metadata &&
            typeof update.metadata === "object" &&
            !Array.isArray(update.metadata)
              ? update.metadata
              : {},
          updatedAt: update.updated_at ? String(update.updated_at) : null,
          isActionable,
        },
        brand: {
          id: recipient.organizationId,
          name: organizationRow?.name || null,
          slug: organizationRow?.slug || null,
        },
        recipient: {
          id: recipient.id,
          partnerOrganizationId: recipient.partnerOrganizationId,
          status:
            recipient.status === "queued" || recipient.status === "notified"
              ? "opened"
              : recipient.status,
          deliveryChannels: recipient.deliveryChannels,
          firstNotifiedAt: recipient.firstNotifiedAt,
          openedAt: recipient.openedAt || nowIso,
          acknowledgedAt: recipient.acknowledgedAt,
          activatedAt: recipient.activatedAt,
          dueAt: recipient.dueAt,
          metadata: recipient.metadata,
          updatedAt: recipient.updatedAt,
        },
        kitItems: kitItemsResult.items,
        productLookup: kitItemsResult.productLookup,
        assetLookup: kitItemsResult.assetLookup,
      },
    });
  } catch (error) {
    console.error("Error in view scope update detail GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
