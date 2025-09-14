import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { hasOrganizationAccess, setDatabaseUserContext } from '@/lib/user-context';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/[tenant]/products - Fetch products for organization
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    console.log('🔍 Fetching products for tenant:', tenant);

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

    // Fetch products for organization with PIM schema
    const { data: products, error: productsError } = await supabase
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
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    console.log(`✅ Found ${products?.length || 0} products for tenant ${(await params).tenant}`);

    return NextResponse.json({
      success: true,
      data: products || [],
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug
      }
    });

  } catch (error) {
    console.error('Error in products GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/[tenant]/products - Create new product
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  console.log('🚀 POST /api/[tenant]/products - ENTRY POINT REACHED');
  
  try {
    console.log('🔍 Awaiting params...');
    const { tenant } = await params;
    console.log('📝 Creating new product for tenant:', tenant);

    // Get authenticated user
    console.log('🔐 Getting authenticated user...');
    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();
    console.log('👤 User authenticated:', { userId: user?.id, email: user?.email });
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user access to organization
    const access = await hasOrganizationAccess(tenant, 'collaborate');
    console.log('🔒 Access check result:', { tenant, access, userId: user.id });
    
    if (!access.hasAccess) {
      console.error('❌ Access denied details:', { 
        tenant, 
        userId: user.id,
        access,
        requiredLevel: 'collaborate'
      });
      return NextResponse.json({ 
        error: 'Access denied. You do not have permission to create products in this organization.' 
      }, { status: 403 });
    }

    // Set database context for RLS
    console.log('📊 Setting database context...');
    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    // Parse request body
    console.log('📋 Parsing request body...');
    const body = await request.json();
    console.log('📊 Request body received:', {
      productName: body.product_name,
      sku: body.sku,
      type: body.type,
      keys: Object.keys(body)
    });
    const {
      type = 'standalone', // parent, variant, standalone
      parent_id,
      product_name,
      sku,
      upc,
      brand_line,
      family_id,
      variant_axis = {},
      status = 'Draft',
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
      marketplace_content = {}
    } = body;

    // Validate required fields
    if (!sku || !product_name || !type) {
      return NextResponse.json(
        { error: 'Product name, SKU, and type are required' },
        { status: 400 }
      );
    }

    // Validate type
    if (!['parent', 'variant', 'standalone'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be parent, variant, or standalone' },
        { status: 400 }
      );
    }

    // Validate parent_id for variants
    if (type === 'variant' && !parent_id) {
      return NextResponse.json(
        { error: 'Parent ID is required for variant products' },
        { status: 400 }
      );
    }

    // Validate UPC format if provided
    if (upc && upc.trim() !== '') {
      const upcLength = upc.length;
      if (![8, 12, 13, 14].includes(upcLength) || !/^\d+$/.test(upc)) {
        return NextResponse.json(
          { error: 'UPC must be 8, 12, 13, or 14 digits' },
          { status: 400 }
        );
      }
    }

    // Use organization ID from access check (already verified user has access)
    const organizationId = access.organizationId;

    // Debug logging
    console.log('📊 Organization ID:', organizationId);
    console.log('📝 User access:', { accessType: access.accessType, accessLevel: access.accessLevel });
    console.log('📝 Product data to insert:', {
      organization_id: organizationId,
      sku,
      product_name,
      brand_line,
      type,
      status
    });

    // Create product with PIM schema  
    console.log('💾 Inserting product into database...');
    
    // Convert empty strings and text to null for UUID fields
    const cleanParentId = parent_id && parent_id.trim() !== '' ? parent_id : null;
    const cleanFamilyId = family_id && family_id.trim() !== '' && family_id.length > 10 ? family_id : null; // Only accept UUID-like strings
    
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        organization_id: organizationId,
        type,
        parent_id: cleanParentId,
        product_name,
        sku,
        upc: upc || null,
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
        created_by: user.id
      })
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
        product_families!family_id (
          name
        )
      `)
      .single();

    console.log('💾 Database operation completed');
    console.log('💾 Product error:', productError?.message || 'No error');
    console.log('💾 Product data:', product ? 'Product created' : 'No product data');

    if (productError) {
      console.error('Error creating product:', productError);
      
      // Handle duplicate SKU error
      if (productError.code === '23505') {
        return NextResponse.json(
          { error: 'A product with this SKU already exists' },
          { status: 409 }
        );
      }
      
      return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
    }

    console.log('✅ Product created successfully:', product.sku);

    return NextResponse.json({
      success: true,
      data: product
    }, { status: 201 });

  } catch (error) {
    console.error('💥 FATAL ERROR in products POST:');
    console.error('💥 Error name:', error?.name);
    console.error('💥 Error message:', error?.message);
    
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}