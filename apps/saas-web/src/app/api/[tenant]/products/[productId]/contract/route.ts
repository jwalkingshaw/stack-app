import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { getProductContract } from "@/lib/product-contracts";


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  const { tenant, productId: rawProductId } = await params;
  const UUID_PREFIX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
  const productId = rawProductId.match(UUID_PREFIX)?.[1] ?? rawProductId;
  const { searchParams } = request.nextUrl;
  const outputProfileId = searchParams.get("outputProfileId") ?? null;
  const marketId = searchParams.get("marketId") ?? null;
  const localeId = searchParams.get("localeId") ?? null;
  const channelId = searchParams.get("channelId") ?? null;
  const destinationId = searchParams.get("destinationId") ?? null;
  const partnerOrganizationId = searchParams.get("partnerOrganizationId") ?? null;
  const selectedBrandSlug = searchParams.get("brand") ?? null;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) return contextResult.response;

    const contract = await getProductContract({
      supabase: getSupabaseServer(),
      organizationId: contextResult.context.targetOrganization.id,
      productId,
      outputProfileId,
      scope: {
        marketId,
        localeId,
        channelId,
        destinationId,
        partnerOrganizationId,
      },
    });

    return NextResponse.json({
      success: true,
      data: contract,
    });
  } catch (error) {
    console.error("Failed to load product contract:", error);
    return NextResponse.json({ error: "Failed to load product contract" }, { status: 500 });
  }
}
