import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCT_VIEW_PERMISSION_KEYS,
  getScopedPermissionSummary,
  resolvePartnerGrantedProductIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";
import { getChannelScopedProductIds } from "@/lib/product-channel-scope";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASIC_PRODUCTS_SELECT_WITH_BRAND = "id, sku, product_name, brand:brand_line";
const BASIC_PRODUCTS_SELECT_FALLBACK = "id, sku, product_name";

// GET /api/[tenant]/products/basic - Get minimal product data for suggestions
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

    const { context } = contextResult;
    const targetOrganizationId = context.targetOrganization.id;

    let constrainedProductIds: string[] | null = null;
    if (context.mode === "partner_brand") {
      const grantedSetProducts = await resolvePartnerGrantedProductIds({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
      });

      if (grantedSetProducts.foundationAvailable) {
        constrainedProductIds = grantedSetProducts.productIds;
      } else {
        if (!context.brandMemberId) {
          return NextResponse.json({
            success: true,
            data: [],
            view: {
              mode: context.mode,
              selectedBrandSlug: context.selectedBrandSlug,
              tenantSlug: context.tenantOrganization.slug,
            },
          });
        }

        const scopedPermissions = await getScopedPermissionSummary({
          organizationId: targetOrganizationId,
          memberId: context.brandMemberId,
          permissionKeys: PRODUCT_VIEW_PERMISSION_KEYS,
        });

        const hasAnyProductScope =
          scopedPermissions.hasOrganizationScope ||
          scopedPermissions.marketIds.length > 0 ||
          scopedPermissions.channelIds.length > 0;

        if (!hasAnyProductScope) {
          return NextResponse.json({
            success: true,
            data: [],
            view: {
              mode: context.mode,
              selectedBrandSlug: context.selectedBrandSlug,
              tenantSlug: context.tenantOrganization.slug,
            },
          });
        }

        if (!scopedPermissions.hasOrganizationScope && scopedPermissions.channelIds.length > 0) {
          const scopedIds = new Set<string>();
          for (const channelId of scopedPermissions.channelIds) {
            const productIds = await getChannelScopedProductIds({
              supabase: supabase as any,
              organizationId: targetOrganizationId,
              channelId,
            });
            for (const productId of productIds || []) {
              scopedIds.add(productId);
            }
          }
          constrainedProductIds = Array.from(scopedIds);
        }
      }
    }

    if (constrainedProductIds && constrainedProductIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        view: {
          mode: context.mode,
          selectedBrandSlug: context.selectedBrandSlug,
          tenantSlug: context.tenantOrganization.slug,
        },
      });
    }

    const buildQuery = (selectClause: string) => {
      let query = supabase
        .from("products")
        .select(selectClause)
        .eq("organization_id", targetOrganizationId)
        .eq("status", "Active")
        .order("product_name");

      if (constrainedProductIds && constrainedProductIds.length > 0) {
        query = query.in("id", constrainedProductIds);
      }

      return query;
    };

    let products: Array<{
      id: string;
      sku: string | null;
      product_name: string | null;
      brand?: string | null;
    }> = [];
    let productsError: { code?: string } | null = null;

    const primaryResult = await buildQuery(BASIC_PRODUCTS_SELECT_WITH_BRAND);
    products = ((primaryResult.data || []) as unknown) as typeof products;
    productsError = (primaryResult.error as { code?: string } | null) || null;

    // Backward compatibility with schemas that do not yet have brand_line.
    if (productsError?.code === "42703") {
      const fallbackResult = await buildQuery(BASIC_PRODUCTS_SELECT_FALLBACK);
      products = ((fallbackResult.data || []) as unknown) as typeof products;
      productsError = (fallbackResult.error as { code?: string } | null) || null;
    }

    if (productsError) {
      console.error("Error fetching products/basic:", productsError);
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }

    const formattedProducts = (products || []).map((product) => ({
      id: product.id,
      sku: product.sku,
      productName: product.product_name,
      brand: product.brand || "",
    }));

    return NextResponse.json({
      success: true,
      data: formattedProducts,
      view: {
        mode: context.mode,
        selectedBrandSlug: context.selectedBrandSlug,
        tenantSlug: context.tenantOrganization.slug,
      },
    });
  } catch (error) {
    console.error("Error in products/basic GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
