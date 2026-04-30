import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireSharingManagerContext } from "../_shared";

type FolderOptionRow = {
  id: string;
  name: string;
  path: string | null;
};

type AssetOptionRow = {
  id: string;
  filename: string;
  folder_id: string | null;
};

// GET /api/[tenant]/sharing/collection-options
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;

    const [foldersResult, assetsResult] = await Promise.all([
      supabaseServer
        .from("dam_folders")
        .select("id,name,path")
        .eq("organization_id", organization.id)
        .order("path", { ascending: true }),
      supabaseServer
        .from("dam_assets")
        .select("id,filename,folder_id,created_at")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    if (foldersResult.error) {
      return NextResponse.json({ error: "Failed to load folder options" }, { status: 500 });
    }
    if (assetsResult.error) {
      return NextResponse.json({ error: "Failed to load file options" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        folders: ((foldersResult.data || []) as FolderOptionRow[]).map((folder) => ({
          id: folder.id,
          name: folder.name,
          path: folder.path || folder.name,
        })),
        assets: ((assetsResult.data || []) as AssetOptionRow[]).map((asset) => ({
          id: asset.id,
          filename: asset.filename,
          folder_id: asset.folder_id,
        })),
      },
    });
  } catch (error) {
    console.error("Error in collection-options GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
