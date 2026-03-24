import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

function normalizeScope(scope: string, tenantSlug: string): string | null {
  const normalized = (scope || "").trim().toLowerCase();
  const tenant = tenantSlug.trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "self" || normalized === tenant) {
    return null;
  }
  return normalized;
}

// GET /api/[tenant]/view/[scope]/markets
// Returns the markets this partner is assigned to for a given brand scope.
// Used by the partner portal market switcher.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; scope: string }> }
) {
  try {
    const { tenant, scope } = await params;
    const selectedBrandSlug = normalizeScope(scope, tenant);

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) return contextResult.response;

    const { context } = contextResult;

    // This endpoint is only useful in a brand-scoped partner view
    if (!selectedBrandSlug || context.tenantOrganization.organizationType !== "partner") {
      return NextResponse.json({ success: true, data: { markets: [] } });
    }

    const partnerOrganizationId = context.tenantOrganization.id;
    const brandOrganizationId = context.targetOrganization.id;

    // Load markets this partner is assigned to for this brand
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("partner_market_assignments" as never)
      .select("market_id")
      .eq("organization_id", brandOrganizationId)
      .eq("partner_organization_id", partnerOrganizationId)
      .eq("is_active", true);

    if (assignmentsError) {
      const msg = String((assignmentsError as { message?: string }).message || "");
      if (msg.includes("partner_market_assignments") || (assignmentsError as { code?: string }).code === "42P01") {
        return NextResponse.json({ success: true, data: { markets: [] } });
      }
      console.error("Failed to load partner market assignments:", assignmentsError);
      return NextResponse.json({ error: "Failed to load partner markets." }, { status: 500 });
    }

    const marketIds = (assignments || []).map((row: { market_id: string }) => row.market_id);

    let markets: Array<{ id: string; name: string; code: string }> = [];
    if (marketIds.length > 0) {
      const { data: marketRows } = await supabaseServer
        .from("markets")
        .select("id,name,code")
        .eq("organization_id", brandOrganizationId)
        .eq("is_active", true)
        .in("id", marketIds)
        .order("name");
      markets = (marketRows || []) as typeof markets;
    }

    return NextResponse.json({ success: true, data: { markets } });
  } catch (error) {
    console.error("Error in partner view markets GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
