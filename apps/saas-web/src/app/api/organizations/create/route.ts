import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient } from "@tradetool/database";
import { kindeAPI } from "@/lib/kinde-management";
import { ensureCoreBasicInformationFields } from "@/lib/pim-bootstrap";
import { randomUUID } from "crypto";

const supabase = createServerClient();
const db = new DatabaseQueries(supabase);

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

    // Check if slug is already taken in Supabase
    const existingOrg = await db.getOrganizationBySlug(slug);
    if (existingOrg) {
      // TODO: Suggest alternative slugs like "acme-corp-2"
      return NextResponse.json(
        { error: "Organization slug already exists" },
        { status: 409 }
      );
    }

    // Generate unique UUID for Kinde organization code
    const kindeOrgCode = `org_${randomUUID()}`;

    let kindeOrg;
    let organization;
    let kindeOrgId;

    try {
      // Step 1: Create organization in Kinde with UUID code
      console.log('Creating organization in Kinde:', { 
        name, 
        code: kindeOrgCode, 
        external_id: slug 
      });
      
      kindeOrg = await kindeAPI.createOrganization({
        name,
        code: kindeOrgCode,      // UUID-based code for security
        external_id: slug,       // User-friendly slug for external reference
      });

      console.log('Kinde organization created:', kindeOrg);

      // Step 2: Create organization in Supabase with Kinde org code
      organization = await db.createOrganization({
        name,
        slug,
        kindeOrgId: kindeOrg.code || kindeOrg.id, // Use code as the ID
        storageUsed: 0,
        storageLimit: 5368709120, // 5GB default
        industry,
        teamSize,
        type: "brand",
        organizationType: "brand",
        partnerCategory: null,
      } as any);

      console.log('Supabase organization created:', organization);

      if (!organization) {
        throw new Error('Failed to create organization in Supabase - returned null');
      }

      await ensureCoreBasicInformationFields(supabase as any, organization.id);

      // Step 3: Add user to new organization in Kinde
      kindeOrgId = kindeOrg.code || kindeOrg.id;
      
      if (user.id && kindeOrgId) {
        try {
          console.log('Adding user to new organization in Kinde');
          await kindeAPI.addUserToOrganization(kindeOrgId, user.id);
          console.log('✅ User successfully added to new organization in Kinde');
        } catch (error) {
          console.warn('❌ Failed to add user to new organization in Kinde:', error);
          throw new Error('Failed to add user to organization in Kinde');
        }
      } else {
        console.warn('Missing required data for user management:', { 
          userId: user.id, 
          kindeOrgId 
        });
      }

      // Step 4: Add user to organization_members table as owner
      try {
        console.log('Adding user to organization_members table as owner (self-invited)');
        
        // Set database context for RLS
        await (supabase as any).rpc('set_config', {
          setting_name: 'app.current_user_id',
          new_value: (user as any).id,
          is_local: true
        });
        
        await (supabase as any).rpc('set_config', {
          setting_name: 'app.current_org_code',
          new_value: kindeOrgId,
          is_local: true
        });

        const { data: memberData, error: memberError } = await (supabase as any)
          .from('organization_members')
          .insert({
            organization_id: organization.id,
            kinde_user_id: (user as any).id,
            email: (user as any).email,
            role: 'owner',
            status: 'active',
            invited_by: (user as any).id  // Self-reference: organization owner invited themselves
          })
          .select()
          .single();

        if (memberError) {
          console.error('Failed to add user to organization_members:', memberError);
          throw new Error('Failed to create organization member record');
        }

        console.log('✅ User successfully added to organization_members as owner:', memberData.id);
      } catch (error) {
        console.error('Error adding user to organization_members:', error);
        throw new Error('Failed to create organization member record');
      }

    } catch (error) {
      console.error('Error during organization creation:', error);
      
      // Rollback: Clean up created resources
      if (organization && organization.id) {
        try {
          // Clean up organization_members
          await supabase
            .from('organization_members')
            .delete()
            .eq('organization_id', organization.id);
          console.log('Rolled back organization_members records');
        } catch (rollbackError) {
          console.error('Failed to rollback organization_members:', rollbackError);
        }
        
        try {
          // Clean up organization
          await supabase
            .from('organizations')
            .delete()
            .eq('id', organization.id);
          console.log('Rolled back Supabase organization');
        } catch (rollbackError) {
          console.error('Failed to rollback Supabase organization:', rollbackError);
        }
      }
      
      // Rollback: Clean up Kinde organization
      if (kindeOrg) {
        try {
          await kindeAPI.deleteOrganization(kindeOrg.id);
          console.log('Rolled back Kinde organization creation');
        } catch (rollbackError) {
          console.error('Failed to rollback Kinde organization:', rollbackError);
        }
      }
      
      throw error; // Re-throw to be caught by outer catch block
    }
    
    return NextResponse.json({ 
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        kindeOrgId: kindeOrgId || kindeOrg.code || kindeOrg.id,
        domain: `${slug}.${process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || "stackcess.com"}`,
      }
    });

  } catch (error) {
    console.error("Organization creation error:", error);
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}
