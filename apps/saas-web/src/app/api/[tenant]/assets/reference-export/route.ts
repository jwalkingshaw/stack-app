import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { resolveImportContext } from "@/lib/product-import-job-service";
import { buildCsv } from "@/lib/product-imports";

const supabase = getSupabaseServer();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const context = await resolveImportContext(request, tenant);

    const { data, error } = await supabase
      .from("dam_assets")
      .select("asset_ref, id, filename, file_type, updated_at, folder_id, dam_folders:dam_assets_folder_id_fkey(path)")
      .eq("organization_id", context.organizationId)
      .order("updated_at", { ascending: false })
      .limit(5000);

    if (error) {
      return NextResponse.json({ error: "Failed to load assets." }, { status: 500 });
    }

    const headers = ["Asset Ref", "Asset ID", "Filename", "Folder", "File Type", "Updated At"];
    const rows = (data || []).map((asset) => {
      const folder = Array.isArray(asset.dam_folders) ? asset.dam_folders[0] : asset.dam_folders;
      return [
        (asset as Record<string, unknown>).asset_ref || "",
        asset.id,
        asset.filename || "",
        (folder as Record<string, unknown> | null)?.path || "",
        asset.file_type || "",
        asset.updated_at || "",
      ];
    });

    const csv = buildCsv(headers, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="asset-reference-export-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED"
        ? 401
        : error instanceof Error && error.message === "ACCESS_DENIED"
          ? 403
          : 500;
    return NextResponse.json({ error: "Failed to export asset references." }, { status });
  }
}
