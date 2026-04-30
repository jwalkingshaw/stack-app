import { getSupabaseServer } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@stack-app/database";

export type OrganizationBaselineScope = {
  marketId: string | null;
  localeId: string | null;
  localeCode: string | null;
};

type MarketRow = {
  id: string;
  default_locale_id: string | null;
  is_default: boolean | null;
};

type LocaleRow = {
  id: string;
  code: string | null;
};

type MarketLocaleRow = {
  locale_id: string;
};

export async function resolveOrganizationBaselineScope(
  supabase: SupabaseClient<Database>,
  organizationId: string
): Promise<OrganizationBaselineScope> {
  const { data: marketsRaw, error: marketsError } = await getSupabaseServer()
    .from("markets")
    .select("id,default_locale_id,is_default")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true })
    .limit(10);

  if (marketsError) {
    console.error("Failed to resolve organization baseline market:", marketsError);
    return { marketId: null, localeId: null, localeCode: null };
  }

  const markets = Array.isArray(marketsRaw) ? (marketsRaw as MarketRow[]) : [];
  const baselineMarket = markets.find((market) => market.is_default) ?? markets[0] ?? null;
  if (!baselineMarket) {
    return { marketId: null, localeId: null, localeCode: null };
  }

  let localeId = baselineMarket.default_locale_id ?? null;

  if (!localeId) {
    const { data: marketLocalesRaw, error: marketLocalesError } = await getSupabaseServer()
      .from("market_locales")
      .select("locale_id")
      .eq("market_id", baselineMarket.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1);

    if (marketLocalesError) {
      console.error("Failed to resolve fallback baseline locale:", marketLocalesError);
    } else {
      const marketLocales = Array.isArray(marketLocalesRaw)
        ? (marketLocalesRaw as MarketLocaleRow[])
        : [];
      localeId = marketLocales[0]?.locale_id ?? null;
    }
  }

  if (!localeId) {
    return {
      marketId: baselineMarket.id,
      localeId: null,
      localeCode: null,
    };
  }

  const { data: localeRaw, error: localeError } = await getSupabaseServer()
    .from("locales")
    .select("id,code")
    .eq("organization_id", organizationId)
    .eq("id", localeId)
    .maybeSingle();

  if (localeError) {
    console.error("Failed to resolve baseline locale code:", localeError);
  }

  const locale = localeRaw as LocaleRow | null;

  return {
    marketId: baselineMarket.id,
    localeId,
    localeCode: locale?.code?.trim().toLowerCase() || null,
  };
}

export function scopeMatchesOrganizationBaseline(params: {
  marketId?: string | null;
  localeId?: string | null;
  localeCode?: string | null;
  channelId?: string | null;
  channelCode?: string | null;
  destinationId?: string | null;
  destinationCode?: string | null;
  baseline: OrganizationBaselineScope;
}): boolean {
  if (params.channelId || params.channelCode || params.destinationId || params.destinationCode) {
    return false;
  }

  if (!params.baseline.marketId) return false;
  if (params.marketId !== params.baseline.marketId) return false;

  const normalizedLocaleCode =
    typeof params.localeCode === "string" ? params.localeCode.trim().toLowerCase() : null;

  if (!params.localeId && !normalizedLocaleCode) {
    return true;
  }

  if (params.localeId && params.baseline.localeId && params.localeId === params.baseline.localeId) {
    return true;
  }

  return Boolean(
    normalizedLocaleCode &&
      params.baseline.localeCode &&
      normalizedLocaleCode === params.baseline.localeCode
  );
}
