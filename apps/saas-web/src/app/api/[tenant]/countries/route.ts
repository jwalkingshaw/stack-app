import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const { data, error } = await supabase
      .from("countries")
      .select("code,name")
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching countries:", error);
      return NextResponse.json({ error: "Failed to fetch countries" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Error in countries GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

