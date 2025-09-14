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
      userId: user.id,
      userEmail: user.email,
      organizationId: organization?.id,
      organizationSlug: organization?.slug,
      organizationName: organization?.name
    });

    // Return minimal safe user data with cache headers
    const response = NextResponse.json({
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
      organization: organization ? {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
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