import { NextRequest, NextResponse } from "next/server";
import type { Json } from "@stack-app/database";
import { getSupabaseServer } from "@/lib/supabase";
import { requireUpdatesContext } from "../../_shared";

// POST /api/[tenant]/updates/[updateId]/duplicate
// Creates a draft copy of the update (with all kit items) under a new title.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; updateId: string }> }
) {
  try {
    const { tenant, updateId } = await params;
    const access = await requireUpdatesContext(request, tenant, { requireManager: true });
    if (!access.ok) return access.response;

    // Fetch source update
    const { data: source, error: sourceError } = await getSupabaseServer()
      .from("partner_updates")
      .select(
        "id,title,summary,urgency,event_label,labels,message_json,due_at,metadata"
      )
      .eq("organization_id", access.context.organizationId)
      .eq("id", updateId)
      .maybeSingle();

    if (sourceError || !source) {
      return NextResponse.json({ error: "Partner update not found" }, { status: 404 });
    }

    // Create the duplicate as a draft
    const { data: newUpdate, error: insertError } = await getSupabaseServer()
      .from("partner_updates")
      .insert({
        organization_id: access.context.organizationId,
        title: `Copy of ${source.title as string}`,
        summary: source.summary as string | null,
        urgency: (source.urgency as string) || "normal",
        status: "draft",
        event_label: source.event_label as string | null,
        labels: (source.labels as string[]) || [],
        message_json: source.message_json as Json,
        due_at: source.due_at as string | null,
        metadata: source.metadata as Json,
        created_by: access.context.userId,
        updated_by: access.context.userId,
      })
      .select("id,title,status")
      .single();

    if (insertError || !newUpdate) {
      console.error("Error duplicating partner update:", insertError);
      return NextResponse.json({ error: "Failed to duplicate update" }, { status: 500 });
    }

    // Fetch source kit items
    const { data: kitItems } = await getSupabaseServer()
      .from("partner_update_kit_items")
      .select(
        "item_type,product_id,asset_id,url,title,description,content_json,sort_order,market_ids,channel_ids,locale_ids,metadata"
      )
      .eq("organization_id", access.context.organizationId)
      .eq("partner_update_id", updateId)
      .order("sort_order", { ascending: true });

    if (kitItems && kitItems.length > 0) {
      const itemRows = kitItems.map((item) => ({
        organization_id: access.context.organizationId,
        partner_update_id: newUpdate.id,
        item_type: item.item_type,
        product_id: item.product_id,
        asset_id: item.asset_id,
        url: item.url,
        title: item.title,
        description: item.description,
        content_json: item.content_json as Json,
        sort_order: item.sort_order,
        market_ids: (item.market_ids as string[]) || [],
        channel_ids: (item.channel_ids as string[]) || [],
        locale_ids: (item.locale_ids as string[]) || [],
        metadata: item.metadata as Json,
        created_by: access.context.userId,
      }));

      const { error: kitError } = await getSupabaseServer()
        .from("partner_update_kit_items")
        .insert(itemRows);

      if (kitError) {
        console.error("Error copying kit items:", kitError);
        // Don't fail — the update was created; items can be re-added manually
      }
    }

    return NextResponse.json({ success: true, data: newUpdate }, { status: 201 });
  } catch (error) {
    console.error("Error in duplicate update route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
