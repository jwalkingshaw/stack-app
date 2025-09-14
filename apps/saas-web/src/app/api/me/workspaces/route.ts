import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { createServerClient, DatabaseQueries } from "@tradetool/database";

// GET /api/me/workspaces
// Returns all workspaces the authenticated user belongs to
export async function GET() {
  try {
    const user = await requireUser();
    
    if (!user?.id) {
      console.log('❌ /api/me/workspaces: No user authenticated');
      return NextResponse.json(
        { error: "unauthorized" }, 
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    // Get all organizations user is a member of
    const { data: memberships, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        role,
        created_at,
        last_accessed_at,
        organization:organizations (
          id,
          name,
          slug,
          kinde_org_id,
          storage_used,
          storage_limit
        )
      `)
      .eq('kinde_user_id', user.id)
      .eq('status', 'active');

    if (error) {
      console.error('❌ Database error fetching user workspaces:', error);
      return NextResponse.json(
        { error: "database_error" },
        { status: 500 }
      );
    }

    if (!memberships || memberships.length === 0) {
      console.log('ℹ️ User has no workspace memberships:', user.id);
      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
        },
        workspaces: [],
        lastUsedWorkspace: null
      });
    }

    // Transform memberships into workspace data
    const workspaces = memberships.map(membership => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
      storageUsed: membership.organization.storage_used || 0,
      storageLimit: membership.organization.storage_limit || 1073741824, // 1GB default
      lastAccessed: membership.last_accessed_at,
      joinedAt: membership.created_at
    }));

    // Find most recently accessed workspace (for smart routing)
    const lastUsedWorkspace = workspaces
      .filter(w => w.lastAccessed)
      .sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime())[0] 
      || workspaces[0]; // Fallback to first workspace if no access tracking

    console.log('✅ User workspaces retrieved:', {
      userId: user.id,
      workspaceCount: workspaces.length,
      lastUsed: lastUsedWorkspace?.slug
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        given_name: user.given_name,
        family_name: user.family_name,
        picture: user.picture,
        name: user.given_name && user.family_name 
          ? `${user.given_name} ${user.family_name}` 
          : user.email,
      },
      workspaces,
      lastUsedWorkspace
    });

  } catch (error) {
    console.error('❌ Error in /api/me/workspaces:', error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 }
    );
  }
}