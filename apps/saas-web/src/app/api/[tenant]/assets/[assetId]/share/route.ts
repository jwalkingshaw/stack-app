import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTenantAccess } from "@/lib/tenant-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type RouteParams = { params: Promise<{ tenant: string; assetId: string }> };

// PATCH /api/[tenant]/assets/[assetId]/share
// Body: { action: "revoke" }
// Immediately expires all active share tokens for an asset.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { tenant, assetId } = await params;

  const access = await requireTenantAccess(request, tenant);
  if (!access.ok) return access.response;
  const { organization } = access;

  // Verify the asset belongs to this organization
  const { data: asset, error: assetError } = await supabase
    .from("dam_assets")
    .select("id, organization_id")
    .eq("id", assetId)
    .eq("organization_id", organization.id)
    .single();

  if (assetError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action !== "revoke") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Expire all share tokens for this asset by setting expires_at to now
  const { error } = await supabase
    .from("asset_shares")
    .update({ expires_at: new Date().toISOString() })
    .eq("asset_id", assetId)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[share/revoke] Failed to revoke shares:", error);
    return NextResponse.json({ error: "Failed to revoke shares" }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Share tokens revoked" });
}
