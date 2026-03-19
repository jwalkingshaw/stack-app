import { NextResponse } from "next/server";
import { getSafeOrganizationData, getSafeUserData } from "@/lib/auth-server";

type SafeUser = NonNullable<Awaited<ReturnType<typeof getSafeUserData>>>;

export async function GET() {
  try {
    const user = await getSafeUserData();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const organization = await getSafeOrganizationData();
    const fullName = user.given_name && user.family_name
      ? `${user.given_name} ${user.family_name}`
      : user.email;

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      given_name: user.given_name,
      family_name: user.family_name,
      picture: user.picture,
      name: fullName,
    };

    const response = NextResponse.json({
      user: safeUser,
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            type: organization.type,
            partnerCategory: organization.partnerCategory,
            logoUrl: organization.logoUrl ?? null,
            storageUsed: organization.storageUsed,
            storageLimit: organization.storageLimit,
          }
        : null,
    });

    response.headers.set("Cache-Control", "private, max-age=30, s-maxage=30");
    return response;
  } catch (error) {
    console.error("Error in /api/me:", error);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
