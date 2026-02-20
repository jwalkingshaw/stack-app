import { NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createServerClient } from "@tradetool/database";

const supabase = createServerClient();

export async function GET() {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("countries")
      .select("code, name")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching reference countries:", error);
      return NextResponse.json({ error: "Failed to fetch countries" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Error in reference countries GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
