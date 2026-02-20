import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@tradetool/auth';
import { DatabaseQueries } from '@tradetool/database';

import { supabaseServer } from '@/lib/supabase';
import { requireTenantAccess } from '@/lib/tenant-auth';
import { canSendInvite } from '@/lib/security-permissions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);

    const tenantAccess = await requireTenantAccess(request, resolvedParams.tenant);
    if (!tenantAccess.ok) {
      return tenantAccess.response;
    }

    const { organization, userId } = tenantAccess;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canManage = await canSendInvite({
      authService,
      userId,
      organizationId: organization.id,
    });

    if (!canManage) {
      return NextResponse.json(
        { error: 'Access denied. You must be an admin or owner to view permission bundles.' },
        { status: 403 }
      );
    }

    const subjectType = request.nextUrl.searchParams.get('subject_type');
    if (subjectType && !['team_member', 'partner'].includes(subjectType)) {
      return NextResponse.json(
        { error: 'subject_type must be team_member or partner' },
        { status: 400 }
      );
    }

    let bundleQuery = (supabaseServer as any)
      .from('permission_bundles')
      .select('id, name, description, subject_type, is_default')
      .eq('organization_id', organization.id)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });

    if (subjectType) {
      bundleQuery = bundleQuery.eq('subject_type', subjectType);
    }

    const { data: bundles, error: bundlesError } = await bundleQuery;
    if (bundlesError) {
      console.error('Failed to load permission bundles:', bundlesError);
      return NextResponse.json({ error: 'Failed to load permission bundles' }, { status: 500 });
    }

    const bundleIds = (bundles || []).map((bundle: any) => bundle.id);
    const rulesByBundleId = new Map<string, any[]>();

    if (bundleIds.length > 0) {
      const { data: rules, error: rulesError } = await (supabaseServer as any)
        .from('permission_bundle_rules')
        .select('id, permission_bundle_id, module_key, level, scope_defaults')
        .in('permission_bundle_id', bundleIds)
        .order('module_key', { ascending: true });

      if (rulesError) {
        console.error('Failed to load permission bundle rules:', rulesError);
        return NextResponse.json({ error: 'Failed to load permission bundle rules' }, { status: 500 });
      }

      for (const rule of rules || []) {
        const list = rulesByBundleId.get(rule.permission_bundle_id) || [];
        list.push(rule);
        rulesByBundleId.set(rule.permission_bundle_id, list);
      }
    }

    const payload = (bundles || []).map((bundle: any) => ({
      ...bundle,
      rules: rulesByBundleId.get(bundle.id) || [],
    }));

    return NextResponse.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error('Error in permission-bundles GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
