import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  return normalized.length === 2 ? normalized : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const { data: markets, error: marketsError } = await supabase
      .from("markets")
      .select("id")
      .eq("organization_id", targetOrganizationId);

    if (marketsError) {
      console.error("Error fetching markets for market-countries:", marketsError);
      return NextResponse.json({ error: "Failed to fetch market countries" }, { status: 500 });
    }

    const marketIds = (markets || []).map((row) => row.id).filter(Boolean);
    if (marketIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data, error } = await supabase
      .from("market_countries")
      .select("id,market_id,country_code,is_active")
      .in("market_id", marketIds);

    if (error) {
      console.error("Error fetching market countries:", error);
      return NextResponse.json({ error: "Failed to fetch market countries" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Error in market-countries GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const body = await request.json().catch(() => ({}));
    const marketId = normalizeToken(body?.market_id ?? body?.marketId);
    const countryCode = normalizeCountryCode(body?.country_code ?? body?.countryCode);

    if (!marketId || !countryCode) {
      return NextResponse.json(
        { error: "market_id and country_code are required." },
        { status: 400 }
      );
    }

    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id")
      .eq("organization_id", targetOrganizationId)
      .eq("id", marketId)
      .maybeSingle();

    if (marketError || !market) {
      return NextResponse.json({ error: "Invalid market selected." }, { status: 400 });
    }

    const { data: country, error: countryError } = await supabase
      .from("countries")
      .select("code")
      .eq("code", countryCode)
      .maybeSingle();

    if (countryError || !country) {
      return NextResponse.json({ error: "Invalid country selected." }, { status: 400 });
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("market_countries")
      .upsert(
        {
          market_id: marketId,
          country_code: countryCode,
          is_active: true,
        },
        { onConflict: "market_id,country_code" }
      )
      .select("id,market_id,country_code,is_active")
      .single();

    if (assignmentError) {
      console.error("Failed to assign country to market:", assignmentError);
      return NextResponse.json({ error: "Failed to assign country to market." }, { status: 500 });
    }

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    console.error("Error in market-countries POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const body = await request.json().catch(() => ({}));
    const marketId = normalizeToken(body?.market_id ?? body?.marketId);
    const countryCode = normalizeCountryCode(body?.country_code ?? body?.countryCode);
    const nextIsActive =
      typeof body?.is_active === "boolean"
        ? body.is_active
        : typeof body?.isActive === "boolean"
          ? body.isActive
          : null;

    if (!marketId || !countryCode || typeof nextIsActive !== "boolean") {
      return NextResponse.json(
        { error: "market_id, country_code, and is_active are required." },
        { status: 400 }
      );
    }

    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id")
      .eq("organization_id", targetOrganizationId)
      .eq("id", marketId)
      .maybeSingle();

    if (marketError || !market) {
      return NextResponse.json({ error: "Invalid market selected." }, { status: 400 });
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("market_countries")
      .select("id,market_id,country_code,is_active")
      .eq("market_id", marketId)
      .eq("country_code", countryCode)
      .maybeSingle();

    if (assignmentError) {
      console.error("Failed to load market country assignment:", assignmentError);
      return NextResponse.json({ error: "Failed to update market countries." }, { status: 500 });
    }

    if (!assignment) {
      return NextResponse.json({ error: "Market country assignment not found." }, { status: 404 });
    }

    if (assignment.is_active === nextIsActive) {
      return NextResponse.json(assignment);
    }

    if (!nextIsActive) {
      const { data: activeAssignments, error: activeAssignmentsError } = await supabase
        .from("market_countries")
        .select("country_code")
        .eq("market_id", marketId)
        .eq("is_active", true);

      if (activeAssignmentsError) {
        console.error("Failed to validate active market countries:", activeAssignmentsError);
        return NextResponse.json({ error: "Failed to update market countries." }, { status: 500 });
      }

      if ((activeAssignments || []).length <= 1) {
        return NextResponse.json(
          { error: "A market must keep at least one active country." },
          { status: 400 }
        );
      }
    }

    const { data: updatedAssignment, error: updateError } = await supabase
      .from("market_countries")
      .update({ is_active: nextIsActive })
      .eq("id", assignment.id)
      .select("id,market_id,country_code,is_active")
      .single();

    if (updateError) {
      console.error("Failed to update market country assignment:", updateError);
      return NextResponse.json({ error: "Failed to update market countries." }, { status: 500 });
    }

    return NextResponse.json(updatedAssignment);
  } catch (error) {
    console.error("Error in market-countries PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


