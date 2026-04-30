import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { getProductContractReadinessList } from "@/lib/product-contracts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/[tenant]/products/[productId]/readiness
// Returns readiness scores for all active destination profiles using the normalized contract service.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  const { tenant, productId: rawProductId } = await params;
  const UUID_PREFIX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
  const productId = rawProductId.match(UUID_PREFIX)?.[1] ?? rawProductId;
  const { searchParams } = request.nextUrl;
  const marketId = searchParams.get("marketId") ?? null;
  const localeId = searchParams.get("localeId") ?? null;
  const channelId = searchParams.get("channelId") ?? null;
  const destinationId = searchParams.get("destinationId") ?? null;
  const partnerOrganizationId = searchParams.get("partnerOrganizationId") ?? null;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.targetOrganization.id;

    const profiles = await getProductContractReadinessList({
      supabase,
      organizationId,
      productId,
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
      data: { profiles, product_id: productId },
    });
  } catch (err) {
    console.error("Unexpected error in GET /products/[productId]/readiness:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
