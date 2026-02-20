import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type CollectionScopeParams = {
  supabase: SupabaseClient<any>;
  organizationId: string;
  collectionId?: string | null;
  assetId?: string | null;
};

export type CollectionScopeResult =
  | { ok: true; collectionId: string | null; assetIds: string[] | null }
  | { ok: false; response: NextResponse };

export async function enforceCollectionScope(
  params: CollectionScopeParams
): Promise<CollectionScopeResult> {
  const { supabase, organizationId } = params;
  const collectionId = params.collectionId?.trim() || null;
  const assetId = params.assetId?.trim() || null;

  if (!collectionId) {
    return { ok: true, collectionId: null, assetIds: null };
  }

  const { data: collection, error } = await (supabase as any)
    .from("dam_collections")
    .select("id, asset_ids, folder_ids")
    .eq("id", collectionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !collection) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Collection not found in this organization." },
        { status: 404 }
      ),
    };
  }

  const explicitAssetIds = Array.isArray(collection.asset_ids)
    ? (Array.from(
        new Set(collection.asset_ids.filter((id: unknown): id is string => typeof id === "string"))
      ) as string[])
    : [];
  const folderIds = Array.isArray(collection.folder_ids)
    ? (Array.from(
        new Set(collection.folder_ids.filter((id: unknown): id is string => typeof id === "string"))
      ) as string[])
    : [];

  let folderScopedAssetIds: string[] = [];
  if (folderIds.length > 0) {
    const { data: rootFolders } = await (supabase as any)
      .from("dam_folders")
      .select("id, path")
      .eq("organization_id", organizationId)
      .in("id", folderIds);

    const folderPaths: string[] = Array.from(
      new Set(
        (rootFolders || [])
          .map((folder: any) => folder.path)
          .filter((path: unknown): path is string => typeof path === "string" && path.length > 0)
      )
    );

    let descendantFolderIds = new Set<string>(
      (rootFolders || [])
        .map((folder: any) => folder.id)
        .filter((id: unknown): id is string => typeof id === "string")
    );

    for (const path of folderPaths) {
      const { data: descendants } = await (supabase as any)
        .from("dam_folders")
        .select("id")
        .eq("organization_id", organizationId)
        .like("path", `${path}/%`);

      (descendants || []).forEach((folder: any) => {
        if (typeof folder.id === "string") {
          descendantFolderIds.add(folder.id);
        }
      });
    }

    const allFolderIds = Array.from(descendantFolderIds);
    if (allFolderIds.length > 0) {
      const { data: folderAssets } = await (supabase as any)
        .from("dam_assets")
        .select("id")
        .eq("organization_id", organizationId)
        .in("folder_id", allFolderIds);

      folderScopedAssetIds = Array.from(
        new Set(
          (folderAssets || [])
            .map((asset: any) => asset.id)
            .filter((id: unknown): id is string => typeof id === "string")
        )
      );
    }
  }

  const assetIds = Array.from(new Set([...explicitAssetIds, ...folderScopedAssetIds]));

  if (assetId && !assetIds.includes(assetId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Asset not found in the requested collection." },
        { status: 404 }
      ),
    };
  }

  return { ok: true, collectionId, assetIds };
}
