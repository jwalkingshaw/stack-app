import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  isMissingColumnError,
  normalizeUuidArray,
  requireSharingManagerContext,
} from "../../_shared";

async function ensureCollectionBelongsToOrg(collectionId: string, organizationId: string) {
  const { data, error } = await (supabaseServer as any)
    .from("dam_collections")
    .select("id")
    .eq("id", collectionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

async function validateScopedIds(params: {
  organizationId: string;
  folderIds: string[];
  assetIds: string[];
}) {
  const { organizationId, folderIds, assetIds } = params;

  if (folderIds.length > 0) {
    const { data: folders, error: folderError } = await (supabaseServer as any)
      .from("dam_folders")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", folderIds);
    if (folderError) {
      return { ok: false as const, error: "Failed to validate folder selection" };
    }
    if ((folders || []).length !== folderIds.length) {
      return { ok: false as const, error: "One or more selected folders are invalid" };
    }
  }

  if (assetIds.length > 0) {
    const { data: assets, error: assetError } = await (supabaseServer as any)
      .from("dam_assets")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", assetIds);
    if (assetError) {
      return { ok: false as const, error: "Failed to validate file selection" };
    }
    if ((assets || []).length !== assetIds.length) {
      return { ok: false as const, error: "One or more selected files are invalid" };
    }
  }

  return { ok: true as const };
}

// PATCH /api/[tenant]/sharing/collections/[collectionId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; collectionId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const collectionId = resolvedParams.collectionId;
    const exists = await ensureCollectionBelongsToOrg(collectionId, organization.id);
    if (!exists) {
      return NextResponse.json({ error: "Shared set not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const folderIds = normalizeUuidArray(body.folderIds);
    const assetIds = normalizeUuidArray(body.assetIds);

    if (!name) {
      return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
    }

    const validation = await validateScopedIds({
      organizationId: organization.id,
      folderIds,
      assetIds,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    let updateResult = await (supabaseServer as any)
      .from("dam_collections")
      .update({
        name,
        asset_ids: assetIds,
        folder_ids: folderIds,
      })
      .eq("id", collectionId)
      .eq("organization_id", organization.id)
      .select("id,name,asset_ids,folder_ids")
      .single();

    if (updateResult.error && isMissingColumnError(updateResult.error)) {
      updateResult = await (supabaseServer as any)
        .from("dam_collections")
        .update({
          name,
          asset_ids: assetIds,
        })
        .eq("id", collectionId)
        .eq("organization_id", organization.id)
        .select("id,name,asset_ids")
        .single();
    }

    if (updateResult.error || !updateResult.data) {
      return NextResponse.json({ error: "Failed to update shared set" }, { status: 500 });
    }

    const row = updateResult.data as any;
    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        asset_ids: Array.isArray(row.asset_ids) ? row.asset_ids : [],
        folder_ids: Array.isArray(row.folder_ids) ? row.folder_ids : [],
      },
    });
  } catch (error) {
    console.error("Error in sharing collection PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/sharing/collections/[collectionId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; collectionId: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const collectionId = resolvedParams.collectionId;
    const exists = await ensureCollectionBelongsToOrg(collectionId, organization.id);
    if (!exists) {
      return NextResponse.json({ error: "Shared set not found" }, { status: 404 });
    }

    const { error } = await (supabaseServer as any)
      .from("dam_collections")
      .delete()
      .eq("id", collectionId)
      .eq("organization_id", organization.id);

    if (error) {
      return NextResponse.json({ error: "Failed to delete shared set" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in sharing collection DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

