import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  isMissingColumnError,
  normalizeUuidArray,
  requireSharingManagerContext,
} from "../_shared";

type CollectionRow = {
  id: string;
  name: string;
  asset_ids: string[] | null;
  folder_ids?: string[] | null;
};

async function selectCollections(organizationId: string) {
  const withFolders = await (supabaseServer as any)
    .from("dam_collections")
    .select("id,name,asset_ids,folder_ids")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (!withFolders.error) {
    return withFolders;
  }

  if (!isMissingColumnError(withFolders.error)) {
    return withFolders;
  }

  return (supabaseServer as any)
    .from("dam_collections")
    .select("id,name,asset_ids")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
}

function mapCollection(row: CollectionRow) {
  return {
    id: row.id,
    name: row.name,
    asset_ids: Array.isArray(row.asset_ids) ? row.asset_ids : [],
    folder_ids: Array.isArray(row.folder_ids) ? row.folder_ids : [],
  };
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

// GET /api/[tenant]/sharing/collections
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const result = await selectCollections(organization.id);
    if (result.error) {
      return NextResponse.json({ error: "Failed to load shared asset sets" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: ((result.data || []) as CollectionRow[]).map(mapCollection),
    });
  } catch (error) {
    console.error("Error in sharing collections GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/sharing/collections
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

    let insertResult = await (supabaseServer as any)
      .from("dam_collections")
      .insert({
        organization_id: organization.id,
        name,
        asset_ids: assetIds,
        folder_ids: folderIds,
        created_by: userId,
      })
      .select("id,name,asset_ids,folder_ids")
      .single();

    if (insertResult.error && isMissingColumnError(insertResult.error)) {
      insertResult = await (supabaseServer as any)
        .from("dam_collections")
        .insert({
          organization_id: organization.id,
          name,
          asset_ids: assetIds,
          created_by: userId,
        })
        .select("id,name,asset_ids")
        .single();
    }

    if (insertResult.error || !insertResult.data) {
      return NextResponse.json({ error: "Failed to create shared asset set" }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        data: mapCollection(insertResult.data as CollectionRow),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in sharing collections POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

