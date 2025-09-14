import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/[tenant]/assets/[assetId]/product-context - Get product relationships for an asset
export async function GET(
  request: NextRequest,
  { params }: { params: { tenant: string; assetId: string } }
) {
  try {
    console.log('🔗 Fetching product context for asset:', params.assetId);

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

    // Get the asset basic info
    const { data: asset, error: assetError } = await supabase
      .from('dam_assets')
      .select('id, filename, original_filename, file_type, product_identifiers, asset_scope, asset_type, tags')
      .eq('id', params.assetId)
      .eq('organization_id', organization.id)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found or access denied' }, { status: 404 });
    }

    // Get all product links for this asset
    const { data: productLinks, error: linksError } = await supabase
      .from('product_asset_links')
      .select(`
        id,
        product_id,
        asset_type,
        link_context,
        confidence,
        match_reason,
        link_type,
        is_active,
        created_at,
        created_by,
        products!inner(
          id,
          sku,
          product_name,
          brand,
          category,
          status
        )
      `)
      .eq('asset_id', params.assetId)
      .eq('organization_id', organization.id)
      .eq('is_active', true)
      .order('confidence', { ascending: false });

    if (linksError) {
      console.error('Error fetching product links:', linksError);
      return NextResponse.json({ error: 'Failed to fetch product context' }, { status: 500 });
    }

    // Get usage statistics for this asset across different contexts
    const { data: linkStats, error: statsError } = await supabase
      .from('product_asset_links')
      .select('link_context, confidence')
      .eq('asset_id', params.assetId)
      .eq('organization_id', organization.id)
      .eq('is_active', true);

    const contextStats = (linkStats || []).reduce((acc: any, link: any) => {
      if (!acc[link.link_context]) {
        acc[link.link_context] = { count: 0, avgConfidence: 0, total: 0 };
      }
      acc[link.link_context].count++;
      acc[link.link_context].total += link.confidence;
      acc[link.link_context].avgConfidence = acc[link.link_context].total / acc[link.link_context].count;
      return acc;
    }, {});

    // Format the product links with additional metadata
    const formattedLinks = (productLinks || []).map((link: any) => ({
      id: link.id,
      productId: link.product_id,
      productName: link.products.product_name,
      sku: link.products.sku,
      brand: link.products.brand,
      category: link.products.category,
      linkContext: link.link_context,
      assetType: link.asset_type,
      confidence: link.confidence,
      matchReason: link.match_reason,
      linkType: link.link_type,
      createdAt: link.created_at,
      createdBy: link.created_by
    }));

    // Determine asset categorization based on links
    const primaryContext = Object.entries(contextStats)
      .sort(([,a]: [string, any], [,b]: [string, any]) => b.avgConfidence - a.avgConfidence)[0]?.[0];

    console.log(`✅ Found ${formattedLinks.length} product relationships for asset`);

    return NextResponse.json({
      success: true,
      data: {
        asset: {
          id: asset.id,
          filename: asset.filename,
          originalFilename: asset.original_filename,
          fileType: asset.file_type,
          productIdentifiers: asset.product_identifiers || [],
          assetScope: asset.asset_scope,
          assetType: asset.asset_type,
          tags: asset.tags || []
        },
        productLinks: formattedLinks,
        statistics: {
          totalLinks: formattedLinks.length,
          uniqueProducts: new Set(formattedLinks.map(l => l.productId)).size,
          contextStats,
          primaryContext,
          averageConfidence: formattedLinks.length > 0 
            ? formattedLinks.reduce((sum, link) => sum + link.confidence, 0) / formattedLinks.length 
            : 0
        }
      }
    });

  } catch (error) {
    console.error('Error in product-context GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}