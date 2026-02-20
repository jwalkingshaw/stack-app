import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
      console.error("Error fetching markets for market-locales:", marketsError);
      return NextResponse.json({ error: "Failed to fetch market locales" }, { status: 500 });
    }

    const marketIds = (markets || []).map((row) => row.id).filter(Boolean);
    if (marketIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data, error } = await supabase
      .from("market_locales")
      .select("id,market_id,locale_id,is_active")
      .in("market_id", marketIds);

    if (error) {
      console.error("Error fetching market locales:", error);
      return NextResponse.json({ error: "Failed to fetch market locales" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Error in market-locales GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
