import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess, setDatabaseUserContext } from "@/lib/user-context";
import {
  PRODUCT_VIEW_PERMISSION_KEYS,
  getScopedPermissionSummary,
  resolvePartnerGrantedProductIds,
  resolvePartnerSharedBrandOrganizationIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";
import { getChannelScopedProductIds } from "@/lib/product-channel-scope";
import { assertBillingCapacity, isBillableSkuRecord } from "@/lib/billing-policy";
import { validateAuthoringScope } from "@/lib/authoring-scope";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRODUCT_SELECT_WITH_BARCODE = `
  id,
  organization_id,
  scin,
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
  scin,
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

type ProductAuthoringScope = {
  mode: "global" | "scoped";
  marketIds: string[];
  channelIds: string[];
  localeIds: string[];
  destinationIds: string[];
};

function normalizeBarcodeInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringIdArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const deduped = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const cleaned = value.trim();
    if (!cleaned) continue;
    deduped.add(cleaned);
  }
  return Array.from(deduped);
}

function normalizeProductAuthoringScope(raw: unknown): ProductAuthoringScope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const mode = value.mode === "scoped" ? "scoped" : value.mode === "global" ? "global" : null;
  if (!mode) return null;

  const normalized: ProductAuthoringScope = {
    mode,
    marketIds: normalizeStringIdArray(value.marketIds),
    channelIds: normalizeStringIdArray(value.channelIds),
    localeIds: normalizeStringIdArray(value.localeIds),
    destinationIds: normalizeStringIdArray(value.destinationIds),
  };

  if (normalized.mode === "global") {
    return {
      mode: "global",
      marketIds: [],
      channelIds: [],
      localeIds: [],
      destinationIds: [],
    };
  }

  return normalized;
}

function withNormalizedBarcode<T extends Record<string, any>>(row: T): T & { barcode: string | null } {
  return {
    ...row,
    barcode: row.barcode ?? row.upc ?? null,
  };
}

type OrganizationLookup = Record<
  string,
  {
    slug: string;
    name: string;
  }
>;

async function fetchProductsForOrganization(params: {
  organizationId: string;
  constrainedProductIds?: string[] | null;
}) {
  const buildProductQuery = (selectClause: string) => {
    let query = supabase
      .from("products")
      .select(selectClause)
      .eq("organization_id", params.organizationId)
      .order("created_at", { ascending: false });

    if (params.constrainedProductIds && params.constrainedProductIds.length > 0) {
      query = query.in("id", params.constrainedProductIds);
    }

    return query;
  };

  let productsResult = await buildProductQuery(PRODUCT_SELECT_WITH_BARCODE);
  if (productsResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
    productsResult = await buildProductQuery(PRODUCT_SELECT_WITH_UPC);
  }

  return {
    products: (productsResult.data || []).map((row: Record<string, any>) =>
      withNormalizedBarcode(row)
    ),
    error: productsResult.error,
  };
}

async function resolveOrganizationLookup(organizationIds: string[]): Promise<OrganizationLookup> {
  if (organizationIds.length === 0) {
    return {};
  }

  const { data, error } = await (supabase as any)
    .from("organizations")
    .select("id,slug,name")
    .in("id", organizationIds);

  if (error || !Array.isArray(data)) {
    return {};
  }

  const lookup: OrganizationLookup = {};
  for (const row of data as Array<{ id: string; slug: string; name: string }>) {
    if (!row.id) continue;
    lookup[row.id] = {
      slug: row.slug,
      name: row.name,
    };
  }
  return lookup;
}

// GET /api/[tenant]/products - Fetch products for organization
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const requestUrl = new URL(request.url);
    const selectedBrandSlug = requestUrl.searchParams.get("brand");
    const requestedViewScope = (requestUrl.searchParams.get("view") || "")
      .trim()
      .toLowerCase();

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
    const isPartnerAllViewRequest =
      requestedViewScope === "all" &&
      context.mode === "tenant" &&
      context.tenantOrganization.organizationType === "partner";

    if (isPartnerAllViewRequest) {
      const partnerOrganizationId = context.tenantOrganization.id;
      const brandOrganizationIds = await resolvePartnerSharedBrandOrganizationIds({
        partnerOrganizationId,
      });

      const ownProductsResult = await fetchProductsForOrganization({
        organizationId: partnerOrganizationId,
      });
      if (ownProductsResult.error) {
        console.error("Error fetching own products:", ownProductsResult.error);
        return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
      }

      const sharedBrandSets = await Promise.all(
        brandOrganizationIds.map(async (brandOrganizationId) => {
          const granted = await resolvePartnerGrantedProductIds({
            brandOrganizationId,
            partnerOrganizationId,
          });
          if (!granted.foundationAvailable || granted.productIds.length === 0) {
            return null;
          }
          return {
            brandOrganizationId,
            grantedProductIds: granted.productIds,
          };
        })
      );

      const sharedBrandEntries = sharedBrandSets.filter(
        (
          row
        ): row is {
          brandOrganizationId: string;
          grantedProductIds: string[];
        } => Boolean(row)
      );

      const sharedProductsResults = await Promise.all(
        sharedBrandEntries.map(({ brandOrganizationId, grantedProductIds }) =>
          fetchProductsForOrganization({
            organizationId: brandOrganizationId,
            constrainedProductIds: grantedProductIds,
          })
        )
      );

      for (const result of sharedProductsResults) {
        if (result.error) {
          console.error("Error fetching shared products:", result.error);
          return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
        }
      }

      const mergedProductsById = new Map<string, Record<string, any>>();
      for (const row of ownProductsResult.products) {
        mergedProductsById.set(String(row.id), row);
      }
      for (const result of sharedProductsResults) {
        for (const row of result.products) {
          mergedProductsById.set(String(row.id), row);
        }
      }

      const mergedProducts = Array.from(mergedProductsById.values());
      const organizationLookup = await resolveOrganizationLookup(
        Array.from(
          new Set(
            mergedProducts
              .map((product) => String(product.organization_id || "").trim())
              .filter((id) => id.length > 0)
          )
        )
      );

      const products = mergedProducts
        .map((product: Record<string, any>) => {
          const organizationId = String(product.organization_id || "").trim();
          const sourceOrg = organizationLookup[organizationId];
          return {
            ...product,
            organization_slug: sourceOrg?.slug || null,
            organization_name: sourceOrg?.name || null,
          };
        })
        .sort(
          (a: Record<string, any>, b: Record<string, any>) =>
            new Date(String(b.created_at || 0)).getTime() -
            new Date(String(a.created_at || 0)).getTime()
        );

      return NextResponse.json({
        success: true,
        data: products,
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

    const productsResult = await fetchProductsForOrganization({
      organizationId: targetOrganizationId,
      constrainedProductIds,
    });

    if (productsResult.error) {
      console.error("Error fetching products:", productsResult.error);
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }

    const products = productsResult.products.map((product) => ({
      ...product,
      organization_slug: context.targetOrganization.slug,
      organization_name: context.targetOrganization.name,
    }));

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
    const organizationId = access.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "Organization context is missing." }, { status: 500 });
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const body = await request.json();
    const hasInitialScope = Object.prototype.hasOwnProperty.call(body, "initialScope");
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
      initialScope,
    } = body;

    const normalizedInitialScope =
      hasInitialScope && initialScope === null
        ? ({
            mode: "global",
            marketIds: [],
            channelIds: [],
            localeIds: [],
            destinationIds: [],
          } as ProductAuthoringScope)
        : hasInitialScope
          ? normalizeProductAuthoringScope(initialScope)
          : null;

    if (hasInitialScope && !normalizedInitialScope) {
      return NextResponse.json(
        { error: "initialScope must be an object or null" },
        { status: 400 }
      );
    }

    const validatedInitialScope = hasInitialScope
      ? await validateAuthoringScope({
          supabase,
          organizationId,
          rawScope: normalizedInitialScope,
        })
      : null;

    if (validatedInitialScope && !validatedInitialScope.ok) {
      return NextResponse.json(
        { error: validatedInitialScope.error },
        { status: validatedInitialScope.status }
      );
    }

    const normalizedMarketplaceContent =
      marketplace_content && typeof marketplace_content === "object" && !Array.isArray(marketplace_content)
        ? { ...(marketplace_content as Record<string, unknown>) }
        : {};
    if (hasInitialScope) {
      normalizedMarketplaceContent.authoringScope =
        validatedInitialScope && validatedInitialScope.ok
          ? validatedInitialScope.scope
          : normalizedInitialScope;
    }

    const barcode = normalizeBarcodeInput(barcodeFromBody) ?? normalizeBarcodeInput(upc);

    if (!product_name || !type) {
      return NextResponse.json(
        { error: "Product name and type are required" },
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

    const cleanParentId = parent_id && parent_id.trim() !== "" ? parent_id : null;
    const cleanFamilyId =
      typeof family_id === "string" && family_id.trim().length > 0 ? family_id.trim() : null;

    if (!cleanFamilyId) {
      return NextResponse.json(
        { error: "Product model (family_id) is required" },
        { status: 400 }
      );
    }

    if (isBillableSkuRecord({ type, status })) {
      const skuCapacity = await assertBillingCapacity({
        organizationId,
        meter: "activeSkuCount",
      });
      if (!skuCapacity.allowed) {
        return NextResponse.json(
          {
            error: skuCapacity.message,
            code: "ACTIVE_SKU_LIMIT_REACHED",
            limit: skuCapacity.limit,
            usage: skuCapacity.usage,
          },
          { status: 403 }
        );
      }
    }

    const { data: family, error: familyError } = await supabase
      .from("product_families")
      .select("id")
      .eq("id", cleanFamilyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (familyError) {
      console.error("Error validating product family:", familyError);
      return NextResponse.json({ error: "Failed to validate product model" }, { status: 500 });
    }

    if (!family) {
      return NextResponse.json(
        { error: "Product model not found for this organization" },
        { status: 404 }
      );
    }

    const insertPayload: Record<string, any> = {
      organization_id: organizationId,
      type,
      parent_id: cleanParentId,
      product_name,
      sku: typeof sku === "string" && sku.trim().length > 0 ? sku.trim() : null,
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
      marketplace_content: normalizedMarketplaceContent,
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
