import { NextRequest, NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { DatabaseQueries, createServerClient } from "@tradetool/database";

const supabase = createServerClient();
const db = new DatabaseQueries(supabase);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kindeId: string }> }
) {
  try {
    const resolvedParams = await params;

    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { kindeId } = resolvedParams;

    if (!kindeId) {
      return NextResponse.json(
        { error: "Kinde ID is required" },
        { status: 400 }
      );
    }

    // Get organization by Kinde ID from Supabase
    const organization = await db.getOrganizationByKindeId(kindeId);

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(organization);

  } catch (error) {
    console.error("Error fetching organization by Kinde ID:", error);
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 }
    );
  }
}