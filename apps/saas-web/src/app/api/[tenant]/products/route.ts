import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess, setDatabaseUserContext } from "@/lib/user-context";
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

const PRODUCT_SELECT_WITH_BARCODE = `
  id,
  type,
  parent_id,
  has_variants,
  variant_count,
  product_name,
  sku,
  barcode,
  brand_line,
  family_id,
  variant_axis,
  status,
  launch_date,
  msrp,
  cost_of_goods,
  margin_percent,
  assets_count,
  content_score,
  short_description,
  long_description,
  features,
  specifications,
  meta_title,
  meta_description,
  keywords,
  weight_g,
  dimensions,
  inheritance,
  is_inherited,
  marketplace_content,
  created_by,
  created_at,
  updated_at,
  last_modified_by,
  product_families!family_id (
    id,
    name,
    description
  )
`;

const PRODUCT_SELECT_WITH_UPC = PRODUCT_SELECT_WITH_BARCODE.replace("barcode", "upc");

const PRODUCT_RETURN_SELECT_WITH_BARCODE = `
  id,
  type,
  parent_id,
  has_variants,
  variant_count,
  product_name,
  sku,
  barcode,
  brand_line,
  family_id,
  variant_axis,
  status,
  launch_date,
  msrp,
  cost_of_goods,
  margin_percent,
  assets_count,
  content_score,
  created_by,
  created_at,
  updated_at,
  product_families!family_id (
    name
  )
`;

const PRODUCT_RETURN_SELECT_WITH_UPC =
  PRODUCT_RETURN_SELECT_WITH_BARCODE.replace("barcode", "upc");

const UPC_MISSING_COLUMN_ERROR = "42703";

function normalizeBarcodeInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function withNormalizedBarcode<T extends Record<string, any>>(row: T): T & { barcode: string | null } {
  return {
    ...row,
    barcode: row.barcode ?? row.upc ?? null,
  };
}

// GET /api/[tenant]/products - Fetch products for organization
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
            organization: {
              id: context.targetOrganization.id,
              name: context.targetOrganization.name,
              slug: context.targetOrganization.slug,
            },
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
            organization: {
              id: context.targetOrganization.id,
              name: context.targetOrganization.name,
              slug: context.targetOrganization.slug,
            },
            view: {
              mode: context.mode,
              selectedBrandSlug: context.selectedBrandSlug,
              tenantSlug: context.tenantOrganization.slug,
            },
          });
        }

        if (
          !scopedPermissions.hasOrganizationScope &&
          scopedPermissions.channelIds.length > 0
        ) {
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
        organization: {
          id: context.targetOrganization.id,
          name: context.targetOrganization.name,
          slug: context.targetOrganization.slug,
        },
        view: {
          mode: context.mode,
          selectedBrandSlug: context.selectedBrandSlug,
          tenantSlug: context.tenantOrganization.slug,
        },
      });
    }

    const buildProductQuery = (selectClause: string) => {
      let query = supabase
        .from("products")
        .select(selectClause)
        .eq("organization_id", targetOrganizationId)
        .order("created_at", { ascending: false });

      if (constrainedProductIds && constrainedProductIds.length > 0) {
        query = query.in("id", constrainedProductIds);
      }

      return query;
    };

    let productsResult = await buildProductQuery(PRODUCT_SELECT_WITH_BARCODE);
    if (productsResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
      productsResult = await buildProductQuery(PRODUCT_SELECT_WITH_UPC);
    }

    const products = (productsResult.data || []).map((row: Record<string, any>) =>
      withNormalizedBarcode(row)
    );
    const productsError = productsResult.error;
    if (productsError) {
      console.error("Error fetching products:", productsError);
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: products || [],
      organization: {
        id: context.targetOrganization.id,
        name: context.targetOrganization.name,
        slug: context.targetOrganization.slug,
      },
      view: {
        mode: context.mode,
        selectedBrandSlug: context.selectedBrandSlug,
        tenantSlug: context.tenantOrganization.slug,
      },
    });
  } catch (error) {
    console.error("Error in products GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/[tenant]/products - Create new product
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (selectedBrandSlug && selectedBrandSlug.trim().length > 0) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant, "collaborate");
    if (!access.hasAccess) {
      return NextResponse.json(
        {
          error:
            "Access denied. You do not have permission to create products in this organization.",
        },
        { status: 403 }
      );
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const body = await request.json();
    const {
      type = "standalone",
      parent_id,
      product_name,
      sku,
      upc,
      barcode: barcodeFromBody,
      brand_line,
      family_id,
      variant_axis = {},
      status = "Draft",
      launch_date,
      msrp,
      cost_of_goods,
      margin_percent,
      short_description,
      long_description,
      features = [],
      specifications = {},
      meta_title,
      meta_description,
      keywords = [],
      weight_g,
      dimensions = {},
      inheritance = {},
      is_inherited = {},
      marketplace_content = {},
    } = body;

    const barcode = normalizeBarcodeInput(barcodeFromBody) ?? normalizeBarcodeInput(upc);

    if (!sku || !product_name || !type) {
      return NextResponse.json(
        { error: "Product name, SKU, and type are required" },
        { status: 400 }
      );
    }

    if (!["parent", "variant", "standalone"].includes(type)) {
      return NextResponse.json(
        { error: "Type must be parent, variant, or standalone" },
        { status: 400 }
      );
    }

    if (type === "variant" && !parent_id) {
      return NextResponse.json(
        { error: "Parent ID is required for variant products" },
        { status: 400 }
      );
    }

    if (barcode) {
      const barcodeLength = barcode.length;
      if (![8, 12, 13, 14].includes(barcodeLength) || !/^\d+$/.test(barcode)) {
        return NextResponse.json(
          { error: "Barcode must be 8, 12, 13, or 14 digits" },
          { status: 400 }
        );
      }
    }

    const organizationId = access.organizationId;
    const cleanParentId = parent_id && parent_id.trim() !== "" ? parent_id : null;
    const cleanFamilyId =
      family_id && family_id.trim() !== "" && family_id.length > 10
        ? family_id
        : null;

    const insertPayload: Record<string, any> = {
      organization_id: organizationId,
      type,
      parent_id: cleanParentId,
      product_name,
      sku,
      barcode: barcode || null,
      brand_line: brand_line || null,
      family_id: cleanFamilyId,
      variant_axis,
      status,
      launch_date,
      msrp,
      cost_of_goods,
      margin_percent,
      short_description,
      long_description,
      features,
      specifications,
      meta_title,
      meta_description,
      keywords,
      weight_g,
      dimensions,
      inheritance,
      is_inherited,
      marketplace_content,
      created_by: user.id,
    };

    let productResult = await supabase
      .from("products")
      .insert(insertPayload)
      .select(PRODUCT_RETURN_SELECT_WITH_BARCODE)
      .single();

    // Backward compatibility for older schemas still using upc.
    if (productResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
      const legacyPayload: Record<string, any> = {
        ...insertPayload,
        upc: insertPayload.barcode,
      };
      delete legacyPayload["barcode"];

      productResult = await supabase
        .from("products")
        .insert(legacyPayload)
        .select(PRODUCT_RETURN_SELECT_WITH_UPC)
        .single();
    }

    const product = productResult.data
      ? withNormalizedBarcode(productResult.data as Record<string, any>)
      : null;
    const productError = productResult.error;

    if (productError) {
      if (productError.code === "23505") {
        return NextResponse.json(
          { error: "A product with this SKU already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        data: product,
      },
      { status: 201 }
    );
  } catch (error) {
    const safeError = error instanceof Error ? error : null;
    console.error("FATAL ERROR in products POST:", safeError);
    return NextResponse.json(
      { error: "Internal server error", details: safeError?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
