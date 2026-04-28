import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// GET /api/[tenant]/team/partners/[partnerOrganizationId]/markets
// Returns markets assigned to this partner + available markets (all org markets not yet assigned)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; partnerOrganizationId: string }> }
) {
  try {
    const { tenant, partnerOrganizationId: partnerOrgParam } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");
    const partnerOrganizationId = normalizeToken(partnerOrgParam);

    if (!partnerOrganizationId) {
      return NextResponse.json({ error: "partnerOrganizationId is required." }, { status: 400 });
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) return contextResult.response;

    const organizationId = contextResult.context.targetOrganization.id;

    // Load all active markets for this org
    const { data: markets, error: marketsError } = await supabaseServer
      .from("markets")
      .select("id,name,code")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name");

    if (marketsError) {
      console.error("Failed to load markets:", marketsError);
      return NextResponse.json({ error: "Failed to load markets." }, { status: 500 });
    }

    // Load active market assignments for this partner.
    // Legacy output_profile_id values are kept for compatibility and represent
    // market-level destination assignments.
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("partner_market_assignments" as never)
      .select("id,market_id,valid_from,created_at,output_profile_id")
      .eq("organization_id", organizationId)
      .eq("partner_organization_id", partnerOrganizationId)
      .eq("is_active", true);

    if (assignmentsError) {
      const msg = String((assignmentsError as { message?: string }).message || "");
      if (msg.includes("partner_market_assignments") || (assignmentsError as { code?: string }).code === "42P01") {
        return NextResponse.json({ error: "Partner market assignments feature not yet available. Apply database migrations first." }, { status: 503 });
      }
      console.error("Failed to load partner market assignments:", assignmentsError);
      return NextResponse.json({ error: "Failed to load partner market assignments." }, { status: 500 });
    }

    const assignmentRows = (assignments || []) as Array<{
      id: string;
      market_id: string;
      valid_from: string | null;
      created_at: string;
      output_profile_id: string | null;
    }>;
    const assignedMarketIds = new Set(assignmentRows.map((r) => r.market_id));
    const assignmentByMarketId = new Map(assignmentRows.map((r) => [r.market_id, r]));

    // Resolve destination profile names/types
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

    const allMarkets = (markets || []) as Array<{ id: string; name: string; code: string }>;

    const assignedMarkets = allMarkets
      .filter((m) => assignedMarketIds.has(m.id))
      .map((m) => {
        const assignment = assignmentByMarketId.get(m.id);
        const profileId = assignment?.output_profile_id ?? null;
        const profile = profileId ? profileById.get(profileId) ?? null : null;
        return {
          assignment_id: assignment?.id,
          market_id: m.id,
          name: m.name,
          code: m.code,
          valid_from: assignment?.valid_from ?? null,
          assigned_at: assignment?.created_at,
          output_profile_id: profileId,
          destination_profile_id: profileId,
          channel: profile ? { id: profile.id, name: profile.name, code: profile.code, profile_type: profile.profile_type } : null,
          destination: profile
            ? { id: profile.id, name: profile.name, code: profile.code, profile_type: profile.profile_type }
            : null,
        };
      });

    const availableMarkets = allMarkets
      .filter((m) => !assignedMarketIds.has(m.id))
      .map((m) => ({ id: m.id, name: m.name, code: m.code }));

    return NextResponse.json({
      success: true,
      data: { assigned_markets: assignedMarkets, available_markets: availableMarkets },
    });
  } catch (error) {
    console.error("Error in partner markets GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
