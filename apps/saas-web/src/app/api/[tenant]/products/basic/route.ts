import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/[tenant]/products/basic - Get minimal product data for suggestions
export async function GET(
  request: NextRequest,
  { params }: { params: { tenant: string } }
) {
  try {
    console.log('📦 Fetching basic products for tenant:', params.tenant);

    // Get authenticated user
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get organization by slug/tenant (use simple select for performance)
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', params.tenant)
      .single();

    if (orgError || !organization) {
      console.error('Organization not found:', orgError);
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Fetch minimal product data for performance
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, sku, product_name, brand')
      .eq('organization_id', organization.id)
      .eq('status', 'Active') // Only active products for suggestions
      .order('product_name');

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    // Transform to match expected format
    const formattedProducts = (products || []).map(product => ({
      id: product.id,
      sku: product.sku,
      productName: product.product_name,
      brand: product.brand
    }));

    console.log(`✅ Fetched ${formattedProducts.length} basic products`);

    return NextResponse.json({
      success: true,
      data: formattedProducts
    });

  } catch (error) {
    console.error('Error in products/basic GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}