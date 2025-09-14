import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { hasOrganizationAccess, setDatabaseUserContext } from '@/lib/user-context';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/[tenant]/products/[productId] - Fetch single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    console.log('🔍 Fetching product:', productId, 'for tenant:', tenant);

    // Get authenticated user
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get organization by slug/tenant
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('slug', tenant)
      .single();

    if (orgError || !organization) {
      console.error('Organization not found:', orgError);
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Fetch product with family relationship
    const { data: product, error: productError } = await supabase
      .from('products')
      .select(`
        id,
        type,
        parent_id,
        has_variants,
        variant_count,
        product_name,
        sku,
        upc,
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
      `)
      .eq('id', productId)
      .eq('organization_id', organization.id)
      .single();

    if (productError || !product) {
      console.error('Product not found:', productError);
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // If this is a parent product, also fetch its variants
    let variants = null;
    if (product.type === 'parent' && product.has_variants) {
      const { data: variantData, error: variantError } = await supabase
        .from('products')
        .select(`
          id,
          type,
          product_name,
          sku,
          upc,
          variant_axis,
          status,
          msrp,
          cost_of_goods,
          margin_percent,
          assets_count,
          content_score,
          created_at,
          updated_at
        `)
        .eq('parent_id', productId)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: true });

      if (!variantError) {
        variants = variantData;
      }
    }

    console.log('✅ Found product:', product.sku);

    return NextResponse.json({
      success: true,
      data: {
        ...product,
        variants
      }
    });

  } catch (error) {
    console.error('Error in product GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/[tenant]/products/[productId] - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    console.log('📝 Updating product:', productId, 'for tenant:', tenant);

    // Get authenticated user
    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user access to organization
    const access = await hasOrganizationAccess(tenant, 'collaborate');
    if (!access.hasAccess) {
      return NextResponse.json({ 
        error: 'Access denied. You do not have permission to update products in this organization.' 
      }, { status: 403 });
    }

    // Set database context for RLS
    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    // Parse request body
    const body = await request.json();
    const updateData = { ...body };
    
    // Add audit fields
    updateData.last_modified_by = user.id;
    // updated_at will be set automatically by trigger

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.organization_id;
    delete updateData.created_by;
    delete updateData.created_at;
    delete updateData.updated_at;
    delete updateData.variant_count; // Managed by triggers
    delete updateData.has_variants; // Managed by triggers

    // Update product
    const { data: product, error: productError } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .eq('organization_id', access.organizationId)
      .select(`
        id,
        type,
        parent_id,
        has_variants,
        variant_count,
        product_name,
        sku,
        upc,
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
      `)
      .single();

    if (productError) {
      console.error('Error updating product:', productError);
      
      // Handle duplicate SKU error
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

    console.log('✅ Product updated successfully:', product.sku);

    return NextResponse.json({
      success: true,
      data: product
    });

  } catch (error) {
    console.error('Error in product PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/[tenant]/products/[productId] - Partial update product
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  // PATCH uses the same logic as PUT for this endpoint
  return await PUT(request, { params });
}

// DELETE /api/[tenant]/products/[productId] - Delete product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    console.log('🗑️ Deleting product:', productId, 'for tenant:', tenant);

    // Get authenticated user
    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user access to organization
    const access = await hasOrganizationAccess(tenant, 'admin');
    if (!access.hasAccess) {
      return NextResponse.json({ 
        error: 'Access denied. You do not have permission to delete products in this organization.' 
      }, { status: 403 });
    }

    // Set database context for RLS
    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    // Check if product exists and get its type
    const { data: product, error: checkError } = await supabase
      .from('products')
      .select('id, type, has_variants, variant_count, sku')
      .eq('id', productId)
      .eq('organization_id', access.organizationId)
      .single();

    if (checkError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // If this is a parent product with variants, prevent deletion
    if (product.type === 'parent' && product.has_variants && product.variant_count > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete parent product with variants. Delete variants first.' 
      }, { status: 400 });
    }

    // Delete product (cascade will handle related records)
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('organization_id', access.organizationId);

    if (deleteError) {
      console.error('Error deleting product:', deleteError);
      return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
    }

    console.log('✅ Product deleted successfully:', product.sku);

    return NextResponse.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Error in product DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}