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

const VARIANT_SELECT_WITH_BARCODE = `
  id,
  type,
  parent_id,
  product_name,
  scin,
  sku,
  barcode,
  variant_attributes,
  status,
  msrp,
  cost_of_goods,
  margin_percent,
  assets_count,
  content_score,
  created_at,
  updated_at
`;

const VARIANT_SELECT_WITH_UPC =
  VARIANT_SELECT_WITH_BARCODE.replace("barcode", "upc");

const UPC_MISSING_COLUMN_ERROR = "42703";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;

function withNormalizedBarcode<T extends Record<string, any>>(
  row: T
): T & { barcode: string | null } {
  return {
    ...row,
    barcode: row.barcode ?? row.upc ?? null,
  };
}

async function resolveChannelScopedProductIds(params: {
  organizationId: string;
  memberId: string;
}): Promise<string[] | null> {
  const scopedPermissions = await getScopedPermissionSummary({
    organizationId: params.organizationId,
    memberId: params.memberId,
    permissionKeys: PRODUCT_VIEW_PERMISSION_KEYS,
  });

  const hasAnyProductScope =
    scopedPermissions.hasOrganizationScope ||
    scopedPermissions.marketIds.length > 0 ||
    scopedPermissions.channelIds.length > 0;

  if (!hasAnyProductScope) {
    return [];
  }

  if (!scopedPermissions.hasOrganizationScope && scopedPermissions.channelIds.length > 0) {
    const scopedIds = new Set<string>();
    for (const channelId of scopedPermissions.channelIds) {
      const ids = await getChannelScopedProductIds({
        supabase: supabase as any,
        organizationId: params.organizationId,
        channelId,
      });
      for (const id of ids || []) {
        scopedIds.add(id);
      }
    }
    return Array.from(scopedIds);
  }

  return null;
}

async function getProductByIdentifier(params: {
  organizationId: string;
  productIdOrSku: string;
}) {
  const normalizedIdentifier = (params.productIdOrSku || "").trim();
  const uuidPrefixMatch = normalizedIdentifier.match(UUID_PREFIX_PATTERN);
  const candidateId = uuidPrefixMatch?.[1] || normalizedIdentifier;

  if (UUID_PATTERN.test(candidateId)) {
    const byId = await supabase
      .from("products")
      .select("id,type,parent_id,product_name,sku")
      .eq("id", candidateId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();

    if (byId.data || byId.error) {
      return byId;
    }
  }

  return await supabase
    .from("products")
    .select("id,type,parent_id,product_name,sku")
    .ilike("sku", normalizedIdentifier)
    .eq("organization_id", params.organizationId)
    .limit(1)
    .maybeSingle();
}

// GET /api/[tenant]/products/[productId]/variants
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
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
      } else if (!context.brandMemberId) {
        constrainedProductIds = [];
      } else {
        constrainedProductIds = await resolveChannelScopedProductIds({
          organizationId: targetOrganizationId,
          memberId: context.brandMemberId,
        });
      }
    }

    if (constrainedProductIds && constrainedProductIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const parentResult = await getProductByIdentifier({
      organizationId: targetOrganizationId,
      productIdOrSku: productId,
    });
    const parent = parentResult.data as
      | { id: string; type: string; parent_id: string | null }
      | null;

    if (parentResult.error || !parent) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const parentId = parent.type === "variant" && parent.parent_id ? parent.parent_id : parent.id;
    if (
      constrainedProductIds &&
      constrainedProductIds.length > 0 &&
      !constrainedProductIds.includes(parentId)
    ) {
      return NextResponse.json({ success: true, data: [] });
    }

    const buildVariantsQuery = (selectClause: string) => {
      let query = supabase
        .from("products")
        .select(selectClause)
        .eq("organization_id", targetOrganizationId)
        .eq("parent_id", parentId)
        .order("created_at", { ascending: true });

      if (constrainedProductIds && constrainedProductIds.length > 0) {
        query = query.in("id", constrainedProductIds);
      }

      return query;
    };

    let variantsResult = await buildVariantsQuery(VARIANT_SELECT_WITH_BARCODE);
    if (variantsResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
      variantsResult = await buildVariantsQuery(VARIANT_SELECT_WITH_UPC);
    }

    if (variantsResult.error) {
      console.error("Error fetching variants:", variantsResult.error);
      return NextResponse.json({ error: "Failed to fetch variants" }, { status: 500 });
    }

    const variants = ((variantsResult.data || []) as Record<string, any>[]).map((row) =>
      withNormalizedBarcode(row)
    );

    return NextResponse.json({ success: true, data: variants });
  } catch (error) {
    console.error("Error in variants GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

