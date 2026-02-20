import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  isMissingTableError,
  requireSharingManagerContext,
} from "../_shared";

// GET /api/[tenant]/sharing/containers
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolvedParams = await params;
    const access = await requireSharingManagerContext(request, resolvedParams.tenant);
    if (!access.ok) return access.response;

    const { organization } = access.context;

    const [marketsResult, channelsResult, collectionsResult] = await Promise.all([
      (supabaseServer as any)
        .from("markets")
        .select("id,name,code,is_active")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      (supabaseServer as any)
        .from("channels")
        .select("id,name,code,is_active")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      (supabaseServer as any)
        .from("dam_collections")
        .select("id,name")
        .eq("organization_id", organization.id)
        .order("name", { ascending: true }),
    ]);

    if (marketsResult.error && !isMissingTableError(marketsResult.error)) {
      return NextResponse.json({ error: "Failed to load markets" }, { status: 500 });
    }
    if (channelsResult.error && !isMissingTableError(channelsResult.error)) {
      return NextResponse.json({ error: "Failed to load channels" }, { status: 500 });
    }
    if (collectionsResult.error && !isMissingTableError(collectionsResult.error)) {
      return NextResponse.json({ error: "Failed to load collections" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        markets: marketsResult.data || [],
        channels: channelsResult.data || [],
        collections: collectionsResult.data || [],
      },
    });
  } catch (error) {
    console.error("Error in sharing containers GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

