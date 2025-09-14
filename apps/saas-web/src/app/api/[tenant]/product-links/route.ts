import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/[tenant]/product-links - Create product-asset link
export async function POST(
  request: NextRequest,
  { params }: { params: { tenant: string } }
) {
  try {
    console.log('🔗 Creating product-asset link for tenant:', params.tenant);

    // Get authenticated user
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const {
      product_id,
      asset_id,
      asset_type,
      link_context,
      confidence,
      match_reason,
      link_type = 'auto'
    } = body;

    // Validate required fields
    if (!product_id || !asset_id || !link_context) {
      return NextResponse.json(
        { error: 'Product ID, Asset ID, and link context are required' },
        { status: 400 }
      );
    }

    // Get organization by slug/tenant
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', params.tenant)
      .single();

    if (orgError || !organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Verify product belongs to organization
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, sku, product_name')
      .eq('id', product_id)
      .eq('organization_id', organization.id)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found or access denied' }, { status: 404 });
    }

    // Verify asset belongs to organization
    const { data: asset, error: assetError } = await supabase
      .from('dam_assets')
      .select('id, filename')
      .eq('id', asset_id)
      .eq('organization_id', organization.id)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found or access denied' }, { status: 404 });
    }

    // Create product-asset link
    const { data: productLink, error: linkError } = await supabase
      .from('product_asset_links')
      .insert({
        organization_id: organization.id,
        product_id,
        asset_id,
        asset_type,
        link_context,
        confidence: confidence || 0.5,
        match_reason: match_reason || 'Manual link',
        link_type,
        is_active: true,
        created_by: user.id
      })
      .select(`
        id,
        asset_type,
        link_context,
        confidence,
        match_reason,
        link_type,
        is_active,
        created_at
      `)
      .single();

    if (linkError) {
      console.error('Error creating product-asset link:', linkError);
      
      // Handle duplicate link error
      if (linkError.code === '23505') {
        return NextResponse.json(
          { error: 'This product-asset link already exists for this context' },
          { status: 409 }
        );
      }
      
      return NextResponse.json({ error: 'Failed to create product-asset link' }, { status: 500 });
    }

    // Update asset with product identifier if not already present
    const currentProductIdentifiers = await supabase
      .from('dam_assets')
      .select('product_identifiers')
      .eq('id', asset_id)
      .single();

    if (currentProductIdentifiers.data) {
      const identifiers = currentProductIdentifiers.data.product_identifiers || [];
      if (!identifiers.includes(product.sku)) {
        await supabase
          .from('dam_assets')
          .update({
            product_identifiers: [...identifiers, product.sku]
          })
          .eq('id', asset_id);
      }
    }

    console.log('✅ Product-asset link created successfully');

    return NextResponse.json({
      success: true,
      data: {
        ...productLink,
        product: {
          id: product.id,
          sku: product.sku,
          product_name: product.product_name
        },
        asset: {
          id: asset.id,
          filename: asset.filename
        }
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Error in product-links POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/[tenant]/product-links - Get product-asset links with filters
export async function GET(
  request: NextRequest,
  { params }: { params: { tenant: string } }
) {
  try {
    console.log('📋 Fetching product-asset links for tenant:', params.tenant);

    // Get authenticated user
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const assetId = searchParams.get('asset_id');
    const linkContext = searchParams.get('link_context');

    // Get organization by slug/tenant
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', params.tenant)
      .single();

    if (orgError || !organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Build query
    let query = supabase
      .from('product_asset_links')
      .select(`
        id,
        product_id,
        asset_id,
        asset_type,
        link_context,
        confidence,
        match_reason,
        link_type,
        is_active,
        created_at,
        products!inner(id, sku, product_name, brand),
        dam_assets!inner(id, filename, file_type, mime_type)
      `)
      .eq('organization_id', organization.id)
      .eq('is_active', true);

    // Apply filters
    if (productId) {
      query = query.eq('product_id', productId);
    }
    if (assetId) {
      query = query.eq('asset_id', assetId);
    }
    if (linkContext) {
      query = query.eq('link_context', linkContext);
    }

    const { data: productLinks, error: linksError } = await query
      .order('created_at', { ascending: false });

    if (linksError) {
      console.error('Error fetching product-asset links:', linksError);
      return NextResponse.json({ error: 'Failed to fetch product-asset links' }, { status: 500 });
    }

    console.log(`✅ Found ${productLinks?.length || 0} product-asset links`);

    return NextResponse.json({
      success: true,
      data: productLinks || []
    });

  } catch (error) {
    console.error('Error in product-links GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}