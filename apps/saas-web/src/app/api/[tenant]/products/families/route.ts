import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/[tenant]/products/families - Fetch product families
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    console.log('🔍 Fetching product families for tenant:', tenant);

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

    // Fetch product families for organization
    const { data: families, error: familiesError } = await supabase
      .from('product_families')
      .select(`
        id,
        name,
        description,
        created_at,
        updated_at
      `)
      .eq('organization_id', organization.id)
      .order('name', { ascending: true });

    if (familiesError) {
      console.error('Error fetching product families:', familiesError);
      return NextResponse.json({ error: 'Failed to fetch product families' }, { status: 500 });
    }

    console.log(`✅ Found ${families?.length || 0} product families for tenant ${tenant}`);

    return NextResponse.json({
      success: true,
      data: families || []
    });

  } catch (error) {
    console.error('Error in product families GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}