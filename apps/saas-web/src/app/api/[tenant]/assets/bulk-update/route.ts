import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface BulkUpdateRequest {
  assetIds: string[];
  updates: {
    tags?: {
      mode: 'replace' | 'add' | 'remove';
      values: string[];
    };
    description?: {
      mode: 'replace' | 'append';
      value: string;
    };
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { tenant: string } }
) {
  try {
    console.log('🔵 PATCH /assets/bulk-update - Starting bulk update:', params.tenant);
    
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
    
    console.log('🔵 PATCH /assets/bulk-update - Auth success:', { 
      orgId: organization.id, 
      userId: user.id 
    });

    // Parse request body
    const { assetIds, updates }: BulkUpdateRequest = await request.json();

    console.log('🔵 PATCH /assets/bulk-update - Update request:', { 
      assetCount: assetIds.length,
      updateFields: Object.keys(updates)
    });

    if (!assetIds || assetIds.length === 0) {
      return NextResponse.json({ error: 'No assets specified' }, { status: 400 });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates specified' }, { status: 400 });
    }

    // Verify all assets exist and belong to this organization
    const { data: existingAssets, error: assetCheckError } = await supabase
      .from('dam_assets')
      .select('id, tags, description')
      .in('id', assetIds)
      .eq('organization_id', organization.id);

    if (assetCheckError || !existingAssets) {
      console.error('🔴 PATCH /assets/bulk-update - Asset verification failed:', assetCheckError);
      return NextResponse.json({ error: 'Failed to verify assets' }, { status: 500 });
    }

    if (existingAssets.length !== assetIds.length) {
      console.log('🔴 PATCH /assets/bulk-update - Some assets not found or not accessible');
      return NextResponse.json({ 
        error: 'Some assets not found or not accessible',
        found: existingAssets.length,
        requested: assetIds.length
      }, { status: 400 });
    }

    // Process updates for each asset
    const updatePromises = existingAssets.map(async (asset) => {
      const assetUpdates: any = {};
      
      // Handle tags update
      if (updates.tags) {
        const currentTags = asset.tags || [];
        const newTagValues = updates.tags.values || [];
        
        switch (updates.tags.mode) {
          case 'replace':
            assetUpdates.tags = newTagValues;
            break;
          case 'add':
            assetUpdates.tags = [...new Set([...currentTags, ...newTagValues])];
            break;
          case 'remove':
            assetUpdates.tags = currentTags.filter(tag => !newTagValues.includes(tag));
            break;
        }
      }
      
      // Handle description update
      if (updates.description) {
        const currentDescription = asset.description || '';
        const newValue = updates.description.value || '';
        
        switch (updates.description.mode) {
          case 'replace':
            assetUpdates.description = newValue;
            break;
          case 'append':
            assetUpdates.description = currentDescription 
              ? `${currentDescription}\n${newValue}` 
              : newValue;
            break;
        }
      }

      // Update the asset if there are changes
      if (Object.keys(assetUpdates).length > 0) {
        const { data, error } = await supabase
          .from('dam_assets')
          .update(assetUpdates)
          .eq('id', asset.id)
          .select()
          .single();

        return { success: !error, assetId: asset.id, data, error };
      }

      return { success: true, assetId: asset.id, data: asset, error: null };
    });

    // Execute all updates
    const results = await Promise.all(updatePromises);
    
    // Analyze results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log('🟢 PATCH /assets/bulk-update - Bulk update completed:', {
      successful: successful.length,
      failed: failed.length,
      total: results.length
    });
    
    return NextResponse.json({
      data: {
        successful: successful.length,
        failed: failed.length,
        total: results.length,
        results: results,
        updatedAssets: successful.map(r => r.data)
      },
      message: `Bulk update completed: ${successful.length} successful, ${failed.length} failed`
    });

  } catch (error) {
    console.error("🔴 PATCH /assets/bulk-update - Bulk update failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}