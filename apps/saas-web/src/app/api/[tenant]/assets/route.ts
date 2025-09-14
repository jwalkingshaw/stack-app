import { NextRequest, NextResponse } from "next/server";
import { verifyTenantAccess } from "@/lib/tenant-auth";
import { supabaseServer } from "@/lib/supabase";
import { DatabaseQueries } from "@tradetool/database";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    console.log('🔍 GET /assets - Fetching assets for tenant:', tenant);
    
    // Secure multi-tenant authorization
    const authResult = await verifyTenantAccess(request, tenant);
    if (!authResult.success) {
      console.log('🔴 GET /assets - Auth failed');
      return authResult.error!;
    }
    
    const { organization, userId } = authResult;
    console.log('🔍 GET /assets - Auth success:', { orgId: organization.id, userId });

    // Fetch assets from database
    const db = new DatabaseQueries(supabaseServer);
    const assets = await db.getAssetsByOrganization(organization.id);
    const folders = await db.getFoldersByOrganization(organization.id);
    
    console.log('🔍 GET /assets - Found assets:', assets.length);
    console.log('🔍 GET /assets - Found folders:', folders.length);

    return NextResponse.json({
      data: {
        assets,
        folders
      }
    });

  } catch (error) {
    console.error("🔴 GET /assets - Failed to fetch assets:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}