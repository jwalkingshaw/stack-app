import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MISSING_DESTINATIONS_TABLE_ERROR = "42P01";

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

type ChannelRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

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

    const [channelsResult, localesResult, marketsResult, destinationsResult] = await Promise.all([
      supabase
        .from("channels")
        .select("id,code,name,is_active")
        .eq("organization_id", targetOrganizationId)
        .order("name", { ascending: true }),
      supabase
        .from("locales")
        .select("id,code,name,is_active")
        .eq("organization_id", targetOrganizationId)
        .order("name", { ascending: true }),
      supabase
        .from("markets")
        .select("id,code,name,is_active,is_default,currency_code,timezone,default_locale_id")
        .eq("organization_id", targetOrganizationId)
        .order("name", { ascending: true }),
      supabase
        .from("channel_destinations")
        .select("id,code,name,description,is_active,channel_id,market_id,sort_order")
        .eq("organization_id", targetOrganizationId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (channelsResult.error) {
      console.error("Error fetching channels for market-context:", channelsResult.error);
      return NextResponse.json({ error: "Failed to fetch market context" }, { status: 500 });
    }
    if (localesResult.error) {
      console.error("Error fetching locales for market-context:", localesResult.error);
      return NextResponse.json({ error: "Failed to fetch market context" }, { status: 500 });
    }
    if (marketsResult.error) {
      console.error("Error fetching markets for market-context:", marketsResult.error);
      return NextResponse.json({ error: "Failed to fetch market context" }, { status: 500 });
    }

    const channels = (channelsResult.data || []) as ChannelRow[];
    const locales = localesResult.data || [];
    const markets = marketsResult.data || [];

    const marketIds = markets.map((market: any) => market.id).filter(Boolean);
    let marketLocales: any[] = [];
    if (marketIds.length > 0) {
      const marketLocalesResult = await supabase
        .from("market_locales")
        .select("id,market_id,locale_id,is_active")
        .in("market_id", marketIds);

      if (marketLocalesResult.error) {
        console.error("Error fetching market-locales for market-context:", marketLocalesResult.error);
        return NextResponse.json({ error: "Failed to fetch market context" }, { status: 500 });
      }
      marketLocales = marketLocalesResult.data || [];
    }

    let destinations: DestinationRow[] = [];
    if (!destinationsResult.error) {
      destinations = (destinationsResult.data || []) as DestinationRow[];
    } else if (destinationsResult.error.code === MISSING_DESTINATIONS_TABLE_ERROR) {
      destinations = channels.map((channel) => ({
        id: `channel-${channel.id}`,
        code: channel.code,
        name: channel.name,
        description: "Fallback destination from channel",
        is_active: channel.is_active,
        channel_id: channel.id,
        market_id: null,
        sort_order: 0,
      }));
    } else {
      console.error("Error fetching destinations for market-context:", destinationsResult.error);
      return NextResponse.json({ error: "Failed to fetch market context" }, { status: 500 });
    }

    return NextResponse.json({
      channels,
      locales,
      markets,
      marketLocales,
      destinations,
    });
  } catch (error) {
    console.error("Error in market-context GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

