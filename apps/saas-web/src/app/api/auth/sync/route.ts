import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { DatabaseQueries } from "@tradetool/database";

// Sync organization from Kinde to Supabase
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    
    if (!session.isAuthenticated || !session.organization) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const db = new DatabaseQueries(supabaseServer);
    const kindeOrg = session.organization;

    // Check if organization already exists
    const existing = await db.getOrganizationBySlug((kindeOrg as any)?.code || "");
    
    if (existing) {
      // Update existing organization
      const { error } = await (supabaseServer as any)
        .from("organizations")
        .update({
          name: (kindeOrg as any)?.name || existing.name,
          kinde_org_id: (kindeOrg as any)?.id || existing.kindeOrgId,
        })
        .eq("id", existing.id);

      if (error) {
        console.error("Failed to update organization:", error);
        return NextResponse.json(
          { error: "Failed to update organization" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        organization: existing,
        message: "Organization updated",
      });
    }

    // Create new organization
    const newOrg = await db.createOrganization({
      name: (kindeOrg as any)?.name || "Unnamed Organization",
      slug: (kindeOrg as any)?.code || `org-${Date.now()}`,
      kindeOrgId: (kindeOrg as any)?.id || "",
      storageUsed: 0,
      storageLimit: 5368709120, // 5GB default
      type: "brand",
      organizationType: "brand",
      partnerCategory: null,
    } as any);

    if (!newOrg) {
      return NextResponse.json(
        { error: "Failed to create organization" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      organization: newOrg,
      message: "Organization created",
    });
  } catch (error) {
    console.error("Organization sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Get organization info
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    
    if (!session.isAuthenticated || !session.organization) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const db = new DatabaseQueries(supabaseServer);
    const organization = await db.getOrganizationBySlug((session.organization as any)?.code || "");

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ organization });
  } catch (error) {
    console.error("Failed to get organization:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
