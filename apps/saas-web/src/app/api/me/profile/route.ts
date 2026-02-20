"use server";

import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { kindeAPI } from "@/lib/kinde-management";

export async function PUT(request: NextRequest) {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const firstName = (body.firstName || body.given_name || "").toString().trim();
    const lastName = (body.lastName || body.family_name || "").toString().trim();

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First and last name are required." },
        { status: 400 }
      );
    }

    await kindeAPI.updateUserProfile(user.id, {
      given_name: firstName,
      family_name: lastName,
    });

    return NextResponse.json({
      success: true,
      data: {
        given_name: firstName,
        family_name: lastName,
      },
      message: "Profile updated successfully.",
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile." },
      { status: 500 }
    );
  }
}
