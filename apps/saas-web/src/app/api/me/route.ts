import { NextResponse } from "next/server";
import { getSafeUserData, getSafeOrganizationData } from "@/lib/auth-server";

export async function GET() {
  try {
    const user = await getSafeUserData();
    
    if (!user) {
      console.log('❌ /api/me: No user data');
      return NextResponse.json(
        { error: "unauthorized" }, 
        { status: 401 }
      );
    }

    // Get organization data if available
    const organization = await getSafeOrganizationData();
    
    console.log('🔍 /api/me Debug:', {
      userId: (user as any)?.id,
      userEmail: (user as any)?.email,
      organizationId: organization?.id,
      organizationSlug: organization?.slug,
      organizationName: organization?.name
    });

    // Return minimal safe user data with cache headers
    const response = NextResponse.json({
      user: {
        id: (user as any)?.id,
        email: (user as any)?.email,
        given_name: (user as any)?.given_name,
        family_name: (user as any)?.family_name,
        picture: (user as any)?.picture,
        name: (user as any)?.given_name && (user as any)?.family_name
          ? `${(user as any)?.given_name} ${(user as any)?.family_name}`
          : (user as any)?.email,
      },
      organization: organization ? {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        type: organization.type,
        partnerCategory: organization.partnerCategory,
        storageUsed: organization.storageUsed,
        storageLimit: organization.storageLimit,
      } : null,
    });
    
    // Add cache headers for performance
    response.headers.set('Cache-Control', 'private, max-age=30, s-maxage=30');
    return response;
  } catch (error) {
    console.error('Error in /api/me:', error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 }
    );
  }
}
