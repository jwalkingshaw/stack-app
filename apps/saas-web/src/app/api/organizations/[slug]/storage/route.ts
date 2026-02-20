import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { DatabaseQueries } from "@tradetool/database";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await params;

    const session = await getAuthSession(request);
    
    if (!session.isAuthenticated) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { slug } = resolvedParams;
    
    // Verify user has access to this organization
    if ((session.organization as any)?.code !== slug) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const db = new DatabaseQueries(supabaseServer);
    const organization = await db.getOrganizationBySlug(slug);

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      used: organization.storageUsed,
      limit: organization.storageLimit,
      available: organization.storageLimit - organization.storageUsed,
      percentage: (organization.storageUsed / organization.storageLimit) * 100,
    });
  } catch (error) {
    console.error("Failed to get storage info:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}