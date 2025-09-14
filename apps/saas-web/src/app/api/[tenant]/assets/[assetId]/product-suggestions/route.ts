import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { generateProductLinkSuggestions } from '@tradetool/ui';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/[tenant]/assets/[assetId]/product-suggestions - Get AI product suggestions for an asset
export async function GET(
  request: NextRequest,
  { params }: { params: { tenant: string; assetId: string } }
) {
  try {
    console.log('🤖 Generating product suggestions for asset:', params.assetId);

    // Get authenticated user
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Get the asset
    const { data: asset, error: assetError } = await supabase
      .from('dam_assets')
      .select('id, filename, original_filename, file_type, auto_link_suggestions')
      .eq('id', params.assetId)
      .eq('organization_id', organization.id)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found or access denied' }, { status: 404 });
    }

    // Check if we have cached suggestions
    if (asset.auto_link_suggestions && Array.isArray(asset.auto_link_suggestions) && asset.auto_link_suggestions.length > 0) {
      console.log('📋 Returning cached product suggestions');
      return NextResponse.json({
        success: true,
        data: asset.auto_link_suggestions,
        cached: true
      });
    }

    // Get all active products for the organization
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, sku, product_name, brand')
      .eq('organization_id', organization.id)
      .eq('status', 'active');

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    if (!products || products.length === 0) {
      console.log('📭 No products found for organization');
      return NextResponse.json({
        success: true,
        data: [],
        message: 'No products available for linking'
      });
    }

    // Generate AI product suggestions using the filename
    const filename = asset.original_filename || asset.filename;
    const suggestions = generateProductLinkSuggestions(filename, products);

    // Cache the suggestions in the database for future use
    if (suggestions.length > 0) {
      await supabase
        .from('dam_assets')
        .update({
          auto_link_suggestions: suggestions,
          detected_skus: suggestions.map(s => ({ sku: s.sku, confidence: s.confidence }))
        })
        .eq('id', params.assetId);
    }

    console.log(`✅ Generated ${suggestions.length} product suggestions`);

    return NextResponse.json({
      success: true,
      data: suggestions,
      cached: false,
      asset: {
        id: asset.id,
        filename: asset.filename,
        file_type: asset.file_type
      }
    });

  } catch (error) {
    console.error('Error in product-suggestions GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/[tenant]/assets/[assetId]/product-suggestions - Refresh product suggestions
export async function POST(
  request: NextRequest,
  { params }: { params: { tenant: string; assetId: string } }
) {
  try {
    console.log('🔄 Refreshing product suggestions for asset:', params.assetId);

    // Get authenticated user
    const { getUser } = getKindeServerSession();
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Get the asset
    const { data: asset, error: assetError } = await supabase
      .from('dam_assets')
      .select('id, filename, original_filename, file_type')
      .eq('id', params.assetId)
      .eq('organization_id', organization.id)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found or access denied' }, { status: 404 });
    }

    // Get all active products for the organization
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, sku, product_name, brand')
      .eq('organization_id', organization.id)
      .eq('status', 'active');

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    // Generate fresh AI product suggestions
    const filename = asset.original_filename || asset.filename;
    const suggestions = generateProductLinkSuggestions(filename, products || []);

    // Update cached suggestions
    await supabase
      .from('dam_assets')
      .update({
        auto_link_suggestions: suggestions,
        detected_skus: suggestions.map(s => ({ sku: s.sku, confidence: s.confidence }))
      })
      .eq('id', params.assetId);

    console.log(`✅ Refreshed ${suggestions.length} product suggestions`);

    return NextResponse.json({
      success: true,
      data: suggestions,
      refreshed: true
    });

  } catch (error) {
    console.error('Error in product-suggestions POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}