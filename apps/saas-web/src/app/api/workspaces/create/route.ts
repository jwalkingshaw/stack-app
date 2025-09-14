import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient } from "@tradetool/database";
import { kindeAPI } from "@/lib/kinde-management";

const supabase = createServerClient();
const db = new DatabaseQueries(supabase);

// POST /api/workspaces/create
// Create a new workspace
export async function POST(request: NextRequest) {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, slug, industry, teamSize } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    console.log('🏢 Creating workspace:', { name, slug, userId: user.id });

    let organization;
    let kindeOrgId;

    try {
      // Step 1: Create organization in Kinde
      console.log('Creating organization in Kinde:', { name, slug });
      const kindeOrg = await kindeAPI.createOrganization({
        name,
        code: `org_${crypto.randomUUID()}`,
        external_id: slug,
      });

      if (!kindeOrg || !kindeOrg.code) {
        throw new Error('Failed to get Kinde organization ID');
      }

      kindeOrgId = kindeOrg.code;
      console.log('✅ Kinde organization created:', kindeOrgId);

      // Step 2: Create organization in Supabase
      organization = await db.createWorkspace({
        name,
        slug,
        kindeOrgId,
        industry,
        teamSize,
      });

      if (!organization) {
        throw new Error('Failed to create workspace in Supabase');
      }

      console.log('✅ Supabase workspace created:', organization.id);

      // Step 3: Add user to organization in Kinde
      if (user.id && kindeOrgId) {
        try {
          console.log('Adding user to organization in Kinde');
          await kindeAPI.addUserToOrganization(kindeOrgId, user.id);
          console.log('✅ User successfully added to organization in Kinde');
        } catch (error) {
          console.warn('❌ Failed to add user to organization in Kinde:', error);
          throw new Error('Failed to add user to organization in Kinde');
        }
      }

      // Step 4: Add user to organization_members table as owner
      try {
        console.log('Adding user to organization_members table as workspace owner');
        
        // Set database context for RLS
        await supabase.rpc('set_config', {
          setting_name: 'app.current_user_id',
          new_value: user.id,
          is_local: true
        });
        
        await supabase.rpc('set_config', {
          setting_name: 'app.current_org_code',
          new_value: kindeOrgId,
          is_local: true
        });

        const { data: memberData, error: memberError } = await supabase
          .from('organization_members')
          .insert({
            organization_id: organization.id,
            kinde_user_id: user.id,
            email: user.email,
            role: 'owner',
            status: 'active',
            invited_by: user.id  // Self-reference: workspace owner invited themselves
          })
          .select()
          .single();

        if (memberError) {
          console.error('Failed to add user to organization_members:', memberError);
          throw new Error('Failed to create workspace member record');
        }

        console.log('✅ User successfully added to organization_members as owner:', memberData.id);
      } catch (error) {
        console.error('Error adding user to organization_members:', error);
        throw new Error('Failed to create workspace member record');
      }

    } catch (error) {
      console.error('Error during workspace creation:', error);
      
      // Rollback: Clean up created resources
      if (organization && organization.id) {
        try {
          // Clean up organization_members
          await supabase
            .from('organization_members')
            .delete()
            .eq('organization_id', organization.id);
          
          // Clean up organization
          await supabase
            .from('organizations')
            .delete()
            .eq('id', organization.id);
        } catch (cleanupError) {
          console.error('Failed to cleanup after error:', cleanupError);
        }
      }

      if (kindeOrgId) {
        try {
          await kindeAPI.deleteOrganization(kindeOrgId);
        } catch (kindeCleanupError) {
          console.error('Failed to cleanup Kinde organization:', kindeCleanupError);
        }
      }

      if (error instanceof Error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      } else {
        return NextResponse.json(
          { error: "Failed to create workspace" },
          { status: 500 }
        );
      }
    }

    // Return success response
    return NextResponse.json({
      success: true,
      organization,
      message: "Workspace created successfully"
    });

  } catch (error) {
    console.error("Workspace creation error:", error);
    return NextResponse.json(
      { error: "Failed to create workspace" },
      { status: 500 }
    );
  }
}