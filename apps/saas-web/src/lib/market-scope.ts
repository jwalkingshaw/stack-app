import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthService } from "@tradetool/auth";

export type MarketScopeParams = {
  authService: AuthService;
  supabase: SupabaseClient<any>;
  userId: string;
  organizationId: string;
  permissionKey: string;
  marketId?: string | null;
  localeCode?: string | null;
  channelId?: string | null;
  collectionId?: string | null;
};

export type MarketScopeResult =
  | { ok: true; marketId: string | null }
  | { ok: false; response: NextResponse };

/**
 * Enforces market-aware authorization with safe fallback behavior:
 * - Users with organization-level permission can read without market scoping.
 * - Users without org-level permission must provide an authorized market.
 * - If locale is provided, it must be enabled for the resolved market.
 */
export async function enforceMarketScopedAccess(
  params: MarketScopeParams
): Promise<MarketScopeResult> {
  const {
    authService,
    supabase,
    userId,
    organizationId,
    permissionKey,
    channelId,
    collectionId,
  } = params;
  const marketId = params.marketId?.trim() || null;
  const localeCode = params.localeCode?.trim() || null;

  if (!marketId) {
    const hasOrgLevelAccess = await authService.hasScopedPermission({
      userId,
      organizationId,
      permissionKey,
      channelId,
      collectionId,
    });

    if (!hasOrgLevelAccess) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "marketId is required for this user scope." },
          { status: 403 }
        ),
      };
    }

    return { ok: true, marketId: null };
  }

  const { data: market, error: marketError } = await (supabase as any)
    .from("markets")
    .select("id")
    .eq("id", marketId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (marketError || !market) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Market not found in this organization." },
        { status: 404 }
      ),
    };
  }

  const hasMarketAccess = await authService.hasScopedPermission({
    userId,
    organizationId,
    permissionKey,
    marketId,
    channelId,
    collectionId,
  });

  if (!hasMarketAccess) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Access denied for the requested market scope." },
        { status: 403 }
      ),
    };
  }

  if (localeCode) {
    const { data: marketLocale, error: marketLocaleError } = await (supabase as any)
      .from("market_locales")
      .select("id, locales!inner(code)")
      .eq("market_id", marketId)
      .eq("is_active", true)
      .ilike("locales.code", localeCode)
      .maybeSingle();

    if (marketLocaleError || !marketLocale) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Locale is not enabled for the requested market." },
          { status: 403 }
        ),
      };
    }
  }

  return { ok: true, marketId };
}
