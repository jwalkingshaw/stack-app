import { NextRequest, NextResponse } from "next/server";
import { AuthService, ScopedPermission } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";
import { enforceMarketScopedAccess } from "@/lib/market-scope";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; folderId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { slug, folderId } = resolvedParams;

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);

    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    const searchParams = new URL(request.url).searchParams;
    const scopeCheck = await enforceMarketScopedAccess({
      authService,
      supabase: supabaseServer as any,
      userId: user.id,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetMetadataEdit,
      marketId: searchParams.get("marketId"),
      localeCode: searchParams.get("locale"),
      channelId: searchParams.get("channelId"),
      collectionId: searchParams.get("collectionId"),
    });
    if (!hasAccess && !scopeCheck.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
    }

    const folders = await db.getFoldersByOrganization(organization.id);
    const targetFolder = folders.find((folder) => folder.id === folderId);
    if (!targetFolder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    let newPath = `/${name.trim()}`;
    if (targetFolder.parentId) {
      const parentFolder = folders.find((folder) => folder.id === targetFolder.parentId);
      if (parentFolder) {
        newPath = `${parentFolder.path}/${name.trim()}`;
      }
    }

    const { error: updateError } = await (supabaseServer as any)
      .from("dam_folders")
      .update({
        name: name.trim(),
        path: newPath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", folderId)
      .eq("organization_id", organization.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to rename folder", details: updateError.message || updateError },
        { status: 500 }
      );
    }

    if (targetFolder.path && targetFolder.path !== newPath) {
      const { data: descendants, error: descendantsError } = await (supabaseServer as any)
        .from("dam_folders")
        .select("id, path")
        .eq("organization_id", organization.id)
        .like("path", `${targetFolder.path}/%`);

      if (descendantsError) {
        console.error("Failed to fetch descendant folders:", descendantsError);
      } else if (descendants && descendants.length > 0) {
        for (const descendant of descendants) {
          const updatedPath = descendant.path.replace(targetFolder.path, newPath);
          await (supabaseServer as any)
            .from("dam_folders")
            .update({
              path: updatedPath,
              updated_at: new Date().toISOString(),
            })
            .eq("id", descendant.id)
            .eq("organization_id", organization.id);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to rename folder:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; folderId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { slug, folderId } = resolvedParams;

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);

    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    const searchParams = new URL(request.url).searchParams;
    const scopeCheck = await enforceMarketScopedAccess({
      authService,
      supabase: supabaseServer as any,
      userId: user.id,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetMetadataEdit,
      marketId: searchParams.get("marketId"),
      localeCode: searchParams.get("locale"),
      channelId: searchParams.get("channelId"),
      collectionId: searchParams.get("collectionId"),
    });
    if (!hasAccess && !scopeCheck.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: existing } = await (supabaseServer as any)
      .from("dam_folders")
      .select("id")
      .eq("id", folderId)
      .eq("organization_id", organization.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const { error: deleteError } = await (supabaseServer as any)
      .from("dam_folders")
      .delete()
      .eq("id", folderId)
      .eq("organization_id", organization.id);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete folder", details: deleteError.message || deleteError },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete folder:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; folderId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { slug, folderId } = resolvedParams;

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);

    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    const searchParams = new URL(request.url).searchParams;
    const scopeCheck = await enforceMarketScopedAccess({
      authService,
      supabase: supabaseServer as any,
      userId: user.id,
      organizationId: organization.id,
      permissionKey: ScopedPermission.AssetMetadataEdit,
      marketId: searchParams.get("marketId"),
      localeCode: searchParams.get("locale"),
      channelId: searchParams.get("channelId"),
      collectionId: searchParams.get("collectionId"),
    });
    if (!hasAccess && !scopeCheck.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const action = body?.action as "move_contents" | "copy_contents" | undefined;
    const destinationFolderId = (body?.destinationFolderId ?? null) as string | null;
    const previewOnly = Boolean(body?.preview);

    if (action !== "move_contents" && action !== "copy_contents") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { data: sourceFolder } = await (supabaseServer as any)
      .from("dam_folders")
      .select("id")
      .eq("id", folderId)
      .eq("organization_id", organization.id)
      .single();

    if (!sourceFolder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    if (destinationFolderId) {
      const { data: destinationFolder } = await (supabaseServer as any)
        .from("dam_folders")
        .select("id")
        .eq("id", destinationFolderId)
        .eq("organization_id", organization.id)
        .single();

      if (!destinationFolder) {
        return NextResponse.json({ error: "Destination folder not found" }, { status: 404 });
      }
    }

    if (action === "move_contents" && destinationFolderId === folderId) {
      return NextResponse.json(
        { error: "Destination folder must be different" },
        { status: 400 }
      );
    }

    const { count: sourceAssetCount, error: sourceCountError } = await (supabaseServer as any)
      .from("dam_assets")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("folder_id", folderId);

    if (sourceCountError) {
      return NextResponse.json(
        { error: "Failed to count source assets", details: sourceCountError.message || sourceCountError },
        { status: 500 }
      );
    }

    if (previewOnly) {
      return NextResponse.json({
        success: true,
        action,
        count: sourceAssetCount ?? 0,
      });
    }

    if (action === "move_contents") {
      const { data: movedAssets, error: moveError } = await (supabaseServer as any)
        .from("dam_assets")
        .update({
          folder_id: destinationFolderId,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organization.id)
        .eq("folder_id", folderId)
        .select("id");

      if (moveError) {
        return NextResponse.json(
          { error: "Failed to move folder contents", details: moveError.message || moveError },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        movedCount: movedAssets?.length ?? 0,
      });
    }

    const { data: sourceAssets, error: sourceAssetsError } = await (supabaseServer as any)
      .from("dam_assets")
      .select(
        "id, filename, original_filename, file_type, asset_type, asset_scope, file_size, mime_type, file_path, s3_key, s3_url, thumbnail_urls, metadata, tags, description, product_identifiers"
      )
      .eq("organization_id", organization.id)
      .eq("folder_id", folderId);

    if (sourceAssetsError) {
      return NextResponse.json(
        { error: "Failed to read source assets", details: sourceAssetsError.message || sourceAssetsError },
        { status: 500 }
      );
    }

    const assets = sourceAssets || [];
    if (assets.length === 0) {
      return NextResponse.json({
        success: true,
        copiedCount: 0,
      });
    }

    const oldToNewAssetId = new Map<string, string>();

    for (const asset of assets) {
      const { data: insertedAsset, error: insertError } = await (supabaseServer as any)
        .from("dam_assets")
        .insert({
          organization_id: organization.id,
          folder_id: destinationFolderId,
          filename: asset.filename,
          original_filename: asset.original_filename,
          file_type: asset.file_type,
          asset_type: asset.asset_type,
          asset_scope: asset.asset_scope,
          file_size: asset.file_size,
          mime_type: asset.mime_type,
          file_path: asset.file_path,
          s3_key: asset.s3_key,
          s3_url: asset.s3_url,
          thumbnail_urls: asset.thumbnail_urls,
          metadata: asset.metadata,
          tags: asset.tags,
          description: asset.description,
          product_identifiers: asset.product_identifiers || [],
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertError || !insertedAsset?.id) {
        return NextResponse.json(
          { error: "Failed to copy folder contents", details: insertError?.message || insertError },
          { status: 500 }
        );
      }

      oldToNewAssetId.set(asset.id, insertedAsset.id);
    }

    const sourceAssetIds = Array.from(oldToNewAssetId.keys());

    const { data: tagAssignments } = await (supabaseServer as any)
      .from("asset_tag_assignments")
      .select("asset_id, tag_id")
      .in("asset_id", sourceAssetIds);

    const mappedTagAssignments = (tagAssignments || [])
      .map((assignment: any) => {
        const newAssetId = oldToNewAssetId.get(assignment.asset_id);
        if (!newAssetId) return null;
        return {
          asset_id: newAssetId,
          tag_id: assignment.tag_id,
          assigned_by: user.id,
        };
      })
      .filter(Boolean);

    if (mappedTagAssignments.length > 0) {
      await (supabaseServer as any)
        .from("asset_tag_assignments")
        .insert(mappedTagAssignments);
    }

    const { data: categoryAssignments } = await (supabaseServer as any)
      .from("asset_category_assignments")
      .select("asset_id, category_id, is_primary")
      .in("asset_id", sourceAssetIds);

    const mappedCategoryAssignments = (categoryAssignments || [])
      .map((assignment: any) => {
        const newAssetId = oldToNewAssetId.get(assignment.asset_id);
        if (!newAssetId) return null;
        return {
          asset_id: newAssetId,
          category_id: assignment.category_id,
          is_primary: assignment.is_primary ?? false,
          assigned_by: user.id,
        };
      })
      .filter(Boolean);

    if (mappedCategoryAssignments.length > 0) {
      await (supabaseServer as any)
        .from("asset_category_assignments")
        .insert(mappedCategoryAssignments);
    }

    const { data: productLinks } = await (supabaseServer as any)
      .from("product_asset_links")
      .select("asset_id, product_id, asset_type, link_context, link_type, confidence, match_reason, is_active")
      .eq("organization_id", organization.id)
      .in("asset_id", sourceAssetIds);

    const mappedProductLinks = (productLinks || [])
      .map((link: any) => {
        const newAssetId = oldToNewAssetId.get(link.asset_id);
        if (!newAssetId) return null;
        return {
          organization_id: organization.id,
          product_id: link.product_id,
          asset_id: newAssetId,
          asset_type: link.asset_type,
          link_context: link.link_context,
          link_type: link.link_type,
          confidence: link.confidence,
          match_reason: link.match_reason,
          is_active: link.is_active ?? true,
          created_by: user.id,
        };
      })
      .filter(Boolean);

    if (mappedProductLinks.length > 0) {
      await (supabaseServer as any)
        .from("product_asset_links")
        .insert(mappedProductLinks);
    }

    return NextResponse.json({
      success: true,
      copiedCount: oldToNewAssetId.size,
    });
  } catch (error) {
    console.error("Failed to transfer folder contents:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
