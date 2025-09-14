import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DELETE /api/[tenant]/product-links/[linkId] - Remove product-asset link
export async function DELETE(
  request: NextRequest,
  { params }: { params: { tenant: string; linkId: string } }
) {
  try {
    console.log('🗑️ Removing product-asset link:', params.linkId);

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

    // Get the link to verify ownership and get asset info
    const { data: productLink, error: linkError } = await supabase
      .from('product_asset_links')
      .select(`
        id,
        asset_id,
        product_id,
        products!inner(sku),
        dam_assets!inner(id, product_identifiers)
      `)
      .eq('id', params.linkId)
      .eq('organization_id', organization.id)
      .single();

    if (linkError || !productLink) {
      return NextResponse.json({ error: 'Product link not found or access denied' }, { status: 404 });
    }

    // Delete the product-asset link
    const { error: deleteError } = await supabase
      .from('product_asset_links')
      .delete()
      .eq('id', params.linkId)
      .eq('organization_id', organization.id);

    if (deleteError) {
      console.error('Error deleting product-asset link:', deleteError);
      return NextResponse.json({ error: 'Failed to delete product-asset link' }, { status: 500 });
    }

    // Remove product identifier from asset if no other links exist
    const { data: otherLinks } = await supabase
      .from('product_asset_links')
      .select('id')
      .eq('asset_id', productLink.asset_id)
      .eq('product_id', productLink.product_id)
      .eq('is_active', true);

    if (!otherLinks || otherLinks.length === 0) {
      // Remove the product SKU from the asset's product_identifiers
      const currentIdentifiers = productLink.dam_assets.product_identifiers || [];
      const productSku = productLink.products.sku;
      const updatedIdentifiers = currentIdentifiers.filter((sku: string) => sku !== productSku);

      await supabase
        .from('dam_assets')
        .update({
          product_identifiers: updatedIdentifiers
        })
        .eq('id', productLink.asset_id);
    }

    console.log('✅ Product-asset link deleted successfully');

    return NextResponse.json({
      success: true,
      message: 'Product-asset link deleted successfully'
    });

  } catch (error) {
    console.error('Error in product-links DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/[tenant]/product-links/[linkId] - Get specific product-asset link
export async function GET(
  request: NextRequest,
  { params }: { params: { tenant: string; linkId: string } }
) {
  try {
    console.log('🔍 Fetching product-asset link:', params.linkId);

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

    // Fetch the product-asset link
    const { data: productLink, error: linkError } = await supabase
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
        dam_assets!inner(id, filename, file_type, mime_type, file_path)
      `)
      .eq('id', params.linkId)
      .eq('organization_id', organization.id)
      .single();

    if (linkError || !productLink) {
      return NextResponse.json({ error: 'Product link not found or access denied' }, { status: 404 });
    }

    console.log('✅ Product-asset link found');

    return NextResponse.json({
      success: true,
      data: productLink
    });

  } catch (error) {
    console.error('Error in product-links GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}