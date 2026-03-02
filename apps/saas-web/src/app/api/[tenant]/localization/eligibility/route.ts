import { NextRequest, NextResponse } from "next/server";
import { getOrganizationBillingLimits } from "@/lib/billing-policy";
import { requireLocalizationAccess } from "../_shared";

// GET /api/[tenant]/localization/eligibility
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;
    const { planId } = await getOrganizationBillingLimits(organization.id);

    const canTranslateProduct = planId !== "starter";

    return NextResponse.json({
      success: true,
      data: {
        planId,
        canTranslateProduct,
        restrictions: {
          translateProduct: canTranslateProduct
            ? null
            : "Translate this product is disabled on Starter. Upgrade plan to enable translation.",
        },
      },
    });
  } catch (error) {
    console.error("Error in localization eligibility GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
