import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { hasOrganizationAccess, setDatabaseUserContext } from '@/lib/user-context';
import {
  PRODUCT_VIEW_PERMISSION_KEYS,
  getScopedPermissionSummary,
  resolvePartnerGrantedProductIds,
  resolveTenantBrandViewContext,
} from '@/lib/partner-brand-view';
import { getChannelScopedProductIds } from '@/lib/product-channel-scope';

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

const PRODUCT_SELECT_WITH_UPC =
  PRODUCT_SELECT_WITH_BARCODE.replace("barcode", "upc");

const PRODUCT_VARIANT_SELECT_WITH_BARCODE = `
  id,
  type,
  product_name,
  sku,
  barcode,
  variant_axis,
  status,
  msrp,
  cost_of_goods,
  margin_percent,
  assets_count,
  content_score,
  created_at,
  updated_at
`;

const PRODUCT_VARIANT_SELECT_WITH_UPC =
  PRODUCT_VARIANT_SELECT_WITH_BARCODE.replace("barcode", "upc");

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
  last_modified_by,
  product_families!family_id (
    name
  )
`;

const PRODUCT_RETURN_SELECT_WITH_UPC =
  PRODUCT_RETURN_SELECT_WITH_BARCODE.replace("barcode", "upc");

const UPC_MISSING_COLUMN_ERROR = "42703";

function withNormalizedBarcode<T extends Record<string, any>>(
  row: T
): T & { barcode: string | null } {
  return {
    ...row,
    barcode: row.barcode ?? row.upc ?? null,
  };
}

function isCrossTenantWrite(params: { tenant: string; selectedBrandSlug: string | null }): boolean {
  const selected = (params.selectedBrandSlug || '').trim().toLowerCase();
  if (!selected) return false;
  return selected !== params.tenant.trim().toLowerCase();
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
  selectClause: string;
}) {
  const byId = await supabase
    .from('products')
    .select(params.selectClause)
    .eq('id', params.productIdOrSku)
    .eq('organization_id', params.organizationId)
    .maybeSingle();

  if (byId.data || byId.error) {
    return byId;
  }

  return await supabase
    .from('products')
    .select(params.selectClause)
    .ilike('sku', params.productIdOrSku)
    .eq('organization_id', params.organizationId)
    .limit(1)
    .maybeSingle();
}

// GET /api/[tenant]/products/[productId] - Fetch single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get('brand');

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
    if (context.mode === 'partner_brand') {
      const grantedSetProducts = await resolvePartnerGrantedProductIds({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
      });

      if (grantedSetProducts.foundationAvailable) {
        constrainedProductIds = grantedSetProducts.productIds;
      } else {
        if (!context.brandMemberId) {
          constrainedProductIds = [];
        } else {
        constrainedProductIds = await resolveChannelScopedProductIds({
          organizationId: targetOrganizationId,
          memberId: context.brandMemberId,
        });
        }
      }
    }

    if (constrainedProductIds && constrainedProductIds.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    let productResult = await getProductByIdentifier({
      organizationId: targetOrganizationId,
      productIdOrSku: productId,
      selectClause: PRODUCT_SELECT_WITH_BARCODE,
    });

    if (productResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
      productResult = await getProductByIdentifier({
        organizationId: targetOrganizationId,
        productIdOrSku: productId,
        selectClause: PRODUCT_SELECT_WITH_UPC,
      });
    }

    const product = productResult.data
      ? withNormalizedBarcode(productResult.data as Record<string, any>)
      : null;
    const productError = productResult.error;

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (
      constrainedProductIds &&
      constrainedProductIds.length > 0 &&
      !constrainedProductIds.includes(product.id)
    ) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    let variants = null;
    if (product.type === 'parent' && product.has_variants) {
      const buildVariantQuery = (selectClause: string) => {
        let query = supabase
          .from('products')
          .select(selectClause)
          .eq('parent_id', product.id)
          .eq('organization_id', targetOrganizationId)
          .order('created_at', { ascending: true });

        if (constrainedProductIds && constrainedProductIds.length > 0) {
          query = query.in('id', constrainedProductIds);
        }

        return query;
      };

      let variantResult = await buildVariantQuery(PRODUCT_VARIANT_SELECT_WITH_BARCODE);
      if (variantResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
        variantResult = await buildVariantQuery(PRODUCT_VARIANT_SELECT_WITH_UPC);
      }
      if (!variantResult.error) {
        variants = ((variantResult.data || []) as Record<string, any>[]).map((row) =>
          withNormalizedBarcode(row)
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...product,
        variants,
      },
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
    console.error('Error in product GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/[tenant]/products/[productId] - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get('brand');

    if (isCrossTenantWrite({ tenant, selectedBrandSlug })) {
      return NextResponse.json(
        { error: 'Cross-tenant writes are blocked in shared brand view.' },
        { status: 403 }
      );
    }

    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant, 'collaborate');
    if (!access.hasAccess) {
      return NextResponse.json(
        {
          error:
            'Access denied. You do not have permission to update products in this organization.',
        },
        { status: 403 }
      );
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const body = await request.json();
    const updateData = { ...body };

    updateData.last_modified_by = user.id;

    if (typeof updateData.upc !== 'undefined' && typeof updateData.barcode === 'undefined') {
      updateData.barcode = updateData.upc;
    }

    delete updateData.id;
    delete updateData.organization_id;
    delete updateData.created_by;
    delete updateData.created_at;
    delete updateData.updated_at;
    delete updateData.variant_count;
    delete updateData.has_variants;
    delete updateData.upc;

    let updateResult = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .eq('organization_id', access.organizationId)
      .select(PRODUCT_RETURN_SELECT_WITH_BARCODE)
      .single();

    // Backward compatibility for older schemas still using upc.
    if (updateResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
      const legacyUpdateData = { ...updateData, upc: updateData.barcode };
      delete legacyUpdateData.barcode;

      updateResult = await supabase
        .from('products')
        .update(legacyUpdateData)
        .eq('id', productId)
        .eq('organization_id', access.organizationId)
        .select(PRODUCT_RETURN_SELECT_WITH_UPC)
        .single();
    }

    const product = updateResult.data
      ? withNormalizedBarcode(updateResult.data as Record<string, any>)
      : null;
    const productError = updateResult.error;

    if (productError) {
      if (productError.code === '23505') {
        return NextResponse.json(
          { error: 'A product with this SKU already exists' },
          { status: 409 }
        );
      }

      return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
    }

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error('Error in product PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/[tenant]/products/[productId] - Partial update product
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  return await PUT(request, { params });
}

// DELETE /api/[tenant]/products/[productId] - Delete product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get('brand');

    if (isCrossTenantWrite({ tenant, selectedBrandSlug })) {
      return NextResponse.json(
        { error: 'Cross-tenant writes are blocked in shared brand view.' },
        { status: 403 }
      );
    }

    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant, 'admin');
    if (!access.hasAccess) {
      return NextResponse.json(
        {
          error:
            'Access denied. You do not have permission to delete products in this organization.',
        },
        { status: 403 }
      );
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const { data: product, error: checkError } = await supabase
      .from('products')
      .select('id, type, has_variants, variant_count, sku')
      .eq('id', productId)
      .eq('organization_id', access.organizationId)
      .single();

    if (checkError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.type === 'parent' && product.has_variants && product.variant_count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete parent product with variants. Delete variants first.' },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('organization_id', access.organizationId);

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    console.error('Error in product DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
