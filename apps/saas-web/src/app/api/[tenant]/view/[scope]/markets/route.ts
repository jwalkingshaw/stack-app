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

    // Load markets this partner is assigned to for this brand.
    // Legacy output_profile_id values are kept for compatibility and represent
    // market-level destination assignments.
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("partner_market_assignments" as never)
      .select("market_id, output_profile_id")
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

    const assignmentRows = (assignments || []) as Array<{
      market_id: string;
      output_profile_id: string | null;
    }>;
    const marketIds = assignmentRows.map((row) => row.market_id);
    const profileIdByMarketId = new Map(
      assignmentRows.map((row) => [row.market_id, row.output_profile_id])
    );

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

    // Resolve profile names/types for any assigned destinations
    const profileIds = [...new Set(assignmentRows.map((r) => r.output_profile_id).filter(Boolean))] as string[];
    const profileById = new Map<string, { id: string; name: string; code: string; profile_type: string }>();
    if (profileIds.length > 0) {
      const { data: profileRowsRaw } = await supabaseServer
        .from("output_channel_profiles" as never)
        .select("id,name,code,profile_type")
        .in("id", profileIds as never);
      const profileRows = (profileRowsRaw ?? []) as Array<{ id: string; name: string; code: string; profile_type: string }>;
      for (const p of profileRows) {
        profileById.set(p.id, p);
      }
    }

    const marketsWithProfile = markets.map((m) => {
      const profileId = profileIdByMarketId.get(m.id) ?? null;
      const profile = profileId ? profileById.get(profileId) ?? null : null;
      return {
        ...m,
        output_profile_id: profileId,
        destination_profile_id: profileId,
        channel: profile ? { id: profile.id, name: profile.name, code: profile.code, profile_type: profile.profile_type } : null,
        destination: profile
          ? { id: profile.id, name: profile.name, code: profile.code, profile_type: profile.profile_type }
          : null,
      };
    });

    return NextResponse.json({ success: true, data: { markets: marketsWithProfile } });
  } catch (error) {
    console.error("Error in partner view markets GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
