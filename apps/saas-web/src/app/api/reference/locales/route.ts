import { NextResponse } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createServerClient } from "@stack-app/database";
import { DEFAULT_LOCALE_CATALOG } from "@/lib/locale-catalog";

const supabase = createServerClient();

export async function GET() {
  try {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // locale_catalog exists in runtime schema but may not exist in every local DB yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("locale_catalog")
      .select("code,name,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error?.code === "42P01") {
      return NextResponse.json(DEFAULT_LOCALE_CATALOG);
    }

    if (error) {
      console.error("Error fetching reference locales:", error);
      return NextResponse.json({ error: "Failed to fetch locales" }, { status: 500 });
    }

    return NextResponse.json(
      (data || []).map((row: { code: string; name: string; sort_order?: number | null }) => ({
        code: row.code,
        name: row.name,
        sort_order: row.sort_order ?? 1000,
      }))
    );
  } catch (error) {
    console.error("Error in reference locales GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
