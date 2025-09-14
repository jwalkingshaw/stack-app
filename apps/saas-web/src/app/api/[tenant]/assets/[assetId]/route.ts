import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { tenant: string; assetId: string } }
) {
  try {
    console.log('🔵 PATCH /assets/[assetId] - Starting asset update:', { 
      tenant: params.tenant, 
      assetId: params.assetId 
    });
    
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
    
    console.log('🔵 PATCH /assets/[assetId] - Auth success:', { 
      orgId: organization.id, 
      userId: user.id 
    });

    // Parse request body
    const body = await request.json();
    const { filename, description, tags } = body;

    console.log('🔵 PATCH /assets/[assetId] - Update data:', { 
      filename, 
      description, 
      tagsCount: tags?.length 
    });

    // Verify asset exists and belongs to this organization
    const { data: existingAsset, error: assetCheckError } = await supabase
      .from('dam_assets')
      .select('id, organization_id')
      .eq('id', params.assetId)
      .eq('organization_id', organization.id)
      .single();

    if (assetCheckError || !existingAsset) {
      console.log('🔴 PATCH /assets/[assetId] - Asset not found or access denied');
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Update asset
    const { data: updatedAsset, error: updateError } = await supabase
      .from('dam_assets')
      .update({
        filename: filename?.trim(),
        description: description?.trim() || null,
        tags: tags || [],
      })
      .eq('id', params.assetId)
      .select()
      .single();

    if (updateError) {
      console.error('🔴 PATCH /assets/[assetId] - Database error:', updateError);
      return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 });
    }

    console.log('🟢 PATCH /assets/[assetId] - Asset updated successfully:', updatedAsset.id);
    
    return NextResponse.json({
      data: updatedAsset,
      message: "Asset updated successfully"
    });

  } catch (error) {
    console.error("🔴 PATCH /assets/[assetId] - Update failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { tenant: string; assetId: string } }
) {
  try {
    console.log('🔵 DELETE /assets/[assetId] - Starting asset deletion:', { 
      tenant: params.tenant, 
      assetId: params.assetId 
    });
    
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

    // Verify asset exists and belongs to this organization
    const { data: existingAsset, error: assetCheckError } = await supabase
      .from('dam_assets')
      .select('id, organization_id, s3_key')
      .eq('id', params.assetId)
      .eq('organization_id', organization.id)
      .single();

    if (assetCheckError || !existingAsset) {
      console.log('🔴 DELETE /assets/[assetId] - Asset not found or access denied');
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Delete from database (S3 cleanup can be done via lifecycle policies or background job)
    const { error: deleteError } = await supabase
      .from('dam_assets')
      .delete()
      .eq('id', params.assetId);

    if (deleteError) {
      console.error('🔴 DELETE /assets/[assetId] - Database error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
    }

    console.log('🟢 DELETE /assets/[assetId] - Asset deleted successfully:', params.assetId);
    
    // TODO: Optionally delete from S3 here or use background job
    
    return NextResponse.json({
      message: "Asset deleted successfully"
    });

  } catch (error) {
    console.error("🔴 DELETE /assets/[assetId] - Deletion failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}