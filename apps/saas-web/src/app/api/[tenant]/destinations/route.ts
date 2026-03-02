import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MISSING_TABLE_ERROR = "42P01";
const UNIQUE_VIOLATION_ERROR = "23505";

type DestinationRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  channel_id: string | null;
  market_id: string | null;
  sort_order: number;
};

type ChannelFallbackRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

function normalizeCode(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

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

    const targetOrganizationId = contextResult.context.targetOrganization.id;

    const destinationResult = await supabase
      .from("channel_destinations")
      .select("id,code,name,description,is_active,channel_id,market_id,sort_order")
      .eq("organization_id", targetOrganizationId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!destinationResult.error) {
      return NextResponse.json((destinationResult.data || []) as DestinationRow[]);
    }

    // Older environments may not have channel_destinations yet.
    if (destinationResult.error.code === MISSING_TABLE_ERROR) {
      const channelsResult = await supabase
        .from("channels")
        .select("id,code,name,is_active")
        .eq("organization_id", targetOrganizationId)
        .order("name", { ascending: true });

      if (channelsResult.error) {
        console.error("Error fetching fallback channel destinations:", channelsResult.error);
        return NextResponse.json({ error: "Failed to fetch destinations" }, { status: 500 });
      }

      const fallbackDestinations: DestinationRow[] = ((channelsResult.data || []) as ChannelFallbackRow[]).map(
        (channel) => ({
          id: `channel-${channel.id}`,
          code: channel.code,
          name: channel.name,
          description: "Fallback destination from channel",
          is_active: channel.is_active,
          channel_id: channel.id,
          market_id: null,
          sort_order: 0,
        })
      );

      return NextResponse.json(fallbackDestinations);
    }

    console.error("Error fetching channel destinations:", destinationResult.error);
    return NextResponse.json({ error: "Failed to fetch destinations" }, { status: 500 });
  } catch (error) {
    console.error("Error in destinations GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite(tenant, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const body = await request.json();

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const codeInput = typeof body?.code === "string" ? body.code : name;
    const code = normalizeCode(codeInput);
    const description =
      typeof body?.description === "string" && body.description.trim().length > 0
        ? body.description.trim()
        : null;
    const channelId =
      typeof body?.channel_id === "string" && body.channel_id.trim().length > 0
        ? body.channel_id.trim()
        : null;
    const marketId =
      typeof body?.market_id === "string" && body.market_id.trim().length > 0
        ? body.market_id.trim()
        : null;
    const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Number(body.sort_order) : 0;

    if (!name || !code) {
      return NextResponse.json({ error: "Name and code are required." }, { status: 400 });
    }

    if (channelId) {
      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .select("id")
        .eq("organization_id", targetOrganizationId)
        .eq("id", channelId)
        .maybeSingle();

      if (channelError || !channel) {
        return NextResponse.json({ error: "Invalid channel selected." }, { status: 400 });
      }
    }

    if (marketId) {
      const { data: market, error: marketError } = await supabase
        .from("markets")
        .select("id")
        .eq("organization_id", targetOrganizationId)
        .eq("id", marketId)
        .maybeSingle();

      if (marketError || !market) {
        return NextResponse.json({ error: "Invalid market selected." }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from("channel_destinations")
      .insert({
        organization_id: targetOrganizationId,
        name,
        code,
        description,
        channel_id: channelId,
        market_id: marketId,
        sort_order: sortOrder,
        is_active: true,
      })
      .select("id,code,name,description,is_active,channel_id,market_id,sort_order")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "A destination with this code already exists." },
          { status: 409 }
        );
      }
      if (error.code === MISSING_TABLE_ERROR) {
        return NextResponse.json(
          { error: "Destinations are not available until migrations are applied." },
          { status: 409 }
        );
      }

      console.error("Error creating destination:", error);
      return NextResponse.json({ error: "Failed to create destination" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error in destinations POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
