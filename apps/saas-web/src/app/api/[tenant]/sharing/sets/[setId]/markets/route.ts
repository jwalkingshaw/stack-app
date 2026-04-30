import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// GET /api/[tenant]/sharing/sets/[setId]/markets
// Returns the markets this set is assigned to (read-only context for set detail UI)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const { tenant, setId: setIdParam } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");
    const setId = normalizeToken(setIdParam);

    if (!setId) {
      return NextResponse.json({ error: "setId is required." }, { status: 400 });
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) return contextResult.response;

    const organizationId = contextResult.context.targetOrganization.id;

    // Find markets that have this set in their catalog
    const { data: assignments, error: assignmentsError } = await getSupabaseServer()
      .from("market_set_assignments")
      .select("market_id")
      .eq("organization_id", organizationId)
      .eq("share_set_id", setId);

    if (assignmentsError) {
      const msg = String((assignmentsError as { message?: string }).message || "");
      if (msg.includes("market_set_assignments") || (assignmentsError as { code?: string }).code === "42P01") {
        return NextResponse.json({ success: true, data: { markets: [] } });
      }
      console.error("Failed to load set market assignments:", assignmentsError);
      return NextResponse.json({ error: "Failed to load set market assignments." }, { status: 500 });
    }

    const marketIds = (assignments || []).map(
      (row: { market_id: string }) => row.market_id
    );

    let markets: Array<{ id: string; name: string; code: string }> = [];
    if (marketIds.length > 0) {
      const { data: marketRows } = await getSupabaseServer()
        .from("markets")
        .select("id,name,code")
        .eq("organization_id", organizationId)
        .in("id", marketIds)
        .order("name");
      markets = (marketRows || []) as typeof markets;
    }

    return NextResponse.json({ success: true, data: { markets } });
  } catch (error) {
    console.error("Error in set markets GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
