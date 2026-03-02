import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateProductCompleteness } from "@/lib/family-attributes";
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;

const normalizeToken = (value: string | null): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCode = (value: string | null): string | null => {
  const token = normalizeToken(value);
  return token ? token.toLowerCase() : null;
};

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
      .select("id,family_id")
      .eq("id", candidateId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();

    if (byId.data || byId.error) {
      return byId;
    }
  }

  return await supabase
    .from("products")
    .select("id,family_id")
    .ilike("sku", normalizedIdentifier)
    .eq("organization_id", params.organizationId)
    .limit(1)
    .maybeSingle();
}

async function resolveScopeIds(params: {
  organizationId: string;
  marketId: string | null;
  channelId: string | null;
  channelCode: string | null;
  localeId: string | null;
  localeCode: string | null;
  destinationId: string | null;
  destinationCode: string | null;
}) {
  const marketId =
    params.marketId && UUID_PATTERN.test(params.marketId) ? params.marketId : null;

  let channelId = params.channelId;
  if (!channelId && params.channelCode) {
    const { data } = await supabase
      .from("channels")
      .select("id")
      .eq("organization_id", params.organizationId)
      .ilike("code", params.channelCode)
      .maybeSingle();
    channelId = (data as { id: string } | null)?.id || null;
  }

  let localeId = params.localeId;
  if (!localeId && params.localeCode) {
    const { data } = await supabase
      .from("locales")
      .select("id")
      .ilike("code", params.localeCode)
      .maybeSingle();
    localeId = (data as { id: string } | null)?.id || null;
  }

  let destinationId = params.destinationId;
  if (!destinationId && params.destinationCode) {
    const { data } = await supabase
      .from("channel_destinations")
      .select("id")
      .eq("organization_id", params.organizationId)
      .ilike("code", params.destinationCode)
      .maybeSingle();
    destinationId = (data as { id: string } | null)?.id || null;
  }

  return {
    marketId,
    channelId,
    localeId,
    destinationId,
  };
}

// GET /api/[tenant]/products/[productId]/completeness
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const selectedBrandSlug = searchParams.get("brand");

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
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const productResult = await getProductByIdentifier({
      organizationId: targetOrganizationId,
      productIdOrSku: productId,
    });
    const product = productResult.data as { id: string; family_id: string | null } | null;

    if (productResult.error || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (
      constrainedProductIds &&
      constrainedProductIds.length > 0 &&
      !constrainedProductIds.includes(product.id)
    ) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const marketId = normalizeToken(searchParams.get("marketId"));
    const channelId = normalizeToken(searchParams.get("channelId"));
    const localeId = normalizeToken(searchParams.get("localeId"));
    const destinationId = normalizeToken(searchParams.get("destinationId"));
    const channelCode = normalizeCode(searchParams.get("channel"));
    const localeCode = normalizeCode(searchParams.get("locale"));
    const destinationCode = normalizeCode(searchParams.get("destination"));

    const resolvedScopeIds = await resolveScopeIds({
      organizationId: targetOrganizationId,
      marketId,
      channelId,
      channelCode,
      localeId,
      localeCode,
      destinationId,
      destinationCode,
    });

    const result = await evaluateProductCompleteness(
      targetOrganizationId,
      product.id,
      product.family_id,
      {},
      {
        marketId: resolvedScopeIds.marketId,
        channelId: resolvedScopeIds.channelId,
        channelCode,
        localeId: resolvedScopeIds.localeId,
        localeCode,
        destinationId: resolvedScopeIds.destinationId,
      }
    );

    const percent =
      result.requiredCount > 0
        ? Math.round((result.completeCount / result.requiredCount) * 100)
        : 100;

    return NextResponse.json({
      success: true,
      data: {
        percent,
        requiredCount: result.requiredCount,
        completeCount: result.completeCount,
        missingAttributes: result.missingAttributes,
        isComplete: result.isComplete,
        familyId: product.family_id,
        scope: {
          marketId: resolvedScopeIds.marketId,
          channelId: resolvedScopeIds.channelId,
          localeId: resolvedScopeIds.localeId,
          destinationId: resolvedScopeIds.destinationId,
        },
      },
    });
  } catch (error) {
    console.error("Error in product completeness GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
