import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import {
  isSupportedMarketCurrency,
  isSupportedMarketTimezone,
} from "@/lib/market-reference-data";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UNIQUE_VIOLATION_ERROR = "23505";

function normalizeMarketCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "")
    .slice(0, 64);
}

function generateMarketCodeFromName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizeCountryCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of value) {
    if (typeof row !== "string") continue;
    const token = row.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function normalizeCountryCodeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of value) {
    if (typeof row !== "string") continue;
    const code = normalizeCountryCode(row);
    if (code.length !== 2 || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
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
    const { data, error } = await supabase
      .from("markets")
      .select("id,code,name,is_active,is_default,currency_code,timezone,default_locale_id")
      .eq("organization_id", targetOrganizationId)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching markets:", error);
      return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Error in markets GET:", error);
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
    const body = await request.json().catch(() => ({}));

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const codeInput =
      typeof body?.code === "string" ? body.code : generateMarketCodeFromName(name);
    const code = normalizeMarketCode(codeInput);

    if (!name) {
      return NextResponse.json({ error: "Market name is required." }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: "Market code is required." }, { status: 400 });
    }

    const countryCodes = normalizeCountryCodeArray(
      body?.country_codes ?? body?.countryCodes
    );
    if (countryCodes.length === 0) {
      return NextResponse.json({ error: "Select at least one country." }, { status: 400 });
    }

    const localeIds = normalizeUuidArray(body?.locale_ids ?? body?.localeIds);
    if (localeIds.length === 0) {
      return NextResponse.json({ error: "Select at least one language." }, { status: 400 });
    }

    const requestedDefaultLocaleId = normalizeToken(
      body?.default_locale_id ?? body?.defaultLocaleId
    );
    if (!requestedDefaultLocaleId) {
      return NextResponse.json({ error: "Select a default language." }, { status: 400 });
    }

    if (!localeIds.includes(requestedDefaultLocaleId)) {
      return NextResponse.json(
        { error: "Default language must be one of the selected languages." },
        { status: 400 }
      );
    }

    const { data: countries, error: countriesError } = await supabase
      .from("countries")
      .select("code")
      .in("code", countryCodes);

    if (countriesError) {
      console.error("Error validating countries:", countriesError);
      return NextResponse.json({ error: "Failed to validate selected countries." }, { status: 500 });
    }
    if ((countries || []).length !== countryCodes.length) {
      return NextResponse.json({ error: "One or more selected countries are invalid." }, { status: 400 });
    }

    const { data: locales, error: localesError } = await supabase
      .from("locales")
      .select("id,is_active")
      .eq("organization_id", targetOrganizationId)
      .in("id", localeIds);

    if (localesError) {
      console.error("Error validating locales:", localesError);
      return NextResponse.json({ error: "Failed to validate selected languages." }, { status: 500 });
    }

    if ((locales || []).length !== localeIds.length) {
      return NextResponse.json({ error: "One or more selected languages are invalid." }, { status: 400 });
    }

    const inactiveLocale = (locales || []).find((locale) => locale.is_active !== true);
    if (inactiveLocale) {
      return NextResponse.json({ error: "All selected languages must be active." }, { status: 400 });
    }

    const { data: existingMarkets, error: existingMarketsError } = await supabase
      .from("markets")
      .select("id")
      .eq("organization_id", targetOrganizationId);

    if (existingMarketsError) {
      console.error("Error fetching existing markets:", existingMarketsError);
      return NextResponse.json({ error: "Failed to create market" }, { status: 500 });
    }

    const shouldBeDefault = Boolean(body?.is_default) || (existingMarkets || []).length === 0;

    if (shouldBeDefault) {
      const { error: clearDefaultError } = await supabase
        .from("markets")
        .update({ is_default: false })
        .eq("organization_id", targetOrganizationId);

      if (clearDefaultError) {
        console.error("Error clearing existing default markets:", clearDefaultError);
        return NextResponse.json({ error: "Failed to create market" }, { status: 500 });
      }
    }

    const currencyCode =
      typeof body?.currency_code === "string" && body.currency_code.trim().length > 0
        ? body.currency_code.trim().toUpperCase()
        : null;
    const timezone =
      typeof body?.timezone === "string" && body.timezone.trim().length > 0
        ? body.timezone.trim()
        : null;

    if (currencyCode && !isSupportedMarketCurrency(currencyCode)) {
      return NextResponse.json(
        { error: "Unsupported currency code for market." },
        { status: 400 }
      );
    }
    if (timezone && !isSupportedMarketTimezone(timezone)) {
      return NextResponse.json(
        { error: "Unsupported timezone for market." },
        { status: 400 }
      );
    }

    const { data: market, error: marketError } = await supabase
      .from("markets")
      .insert({
        organization_id: targetOrganizationId,
        name,
        code,
        is_active: true,
        is_default: shouldBeDefault,
        currency_code: currencyCode,
        timezone,
        default_locale_id: requestedDefaultLocaleId,
      })
      .select("id,code,name,is_active,is_default,currency_code,timezone,default_locale_id")
      .single();

    if (marketError) {
      if (marketError.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "A market with this code already exists." },
          { status: 409 }
        );
      }

      console.error("Error creating market:", marketError);
      return NextResponse.json({ error: "Failed to create market" }, { status: 500 });
    }

    const countryRows = countryCodes.map((countryCode) => ({
      market_id: market.id,
      country_code: countryCode,
      is_active: true,
    }));
    const { error: marketCountriesError } = await supabase
      .from("market_countries")
      .upsert(countryRows, { onConflict: "market_id,country_code" });

    if (marketCountriesError) {
      console.error("Error assigning countries to market:", marketCountriesError);
      await supabase
        .from("markets")
        .delete()
        .eq("organization_id", targetOrganizationId)
        .eq("id", market.id);
      return NextResponse.json({ error: "Failed to assign countries to market." }, { status: 500 });
    }

    const localeRows = localeIds.map((localeId) => ({
      market_id: market.id,
      locale_id: localeId,
      is_active: true,
    }));
    const { error: marketLocalesError } = await supabase
      .from("market_locales")
      .upsert(localeRows, { onConflict: "market_id,locale_id" });

    if (marketLocalesError) {
      console.error("Error assigning locales to market:", marketLocalesError);
      await supabase
        .from("markets")
        .delete()
        .eq("organization_id", targetOrganizationId)
        .eq("id", market.id);
      return NextResponse.json({ error: "Failed to assign languages to market." }, { status: 500 });
    }

    return NextResponse.json(market, { status: 201 });
  } catch (error) {
    console.error("Error in markets POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
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
    const body = await request.json().catch(() => ({}));
    const marketId = normalizeToken(body?.market_id ?? body?.marketId ?? body?.id);

    if (!marketId) {
      return NextResponse.json({ error: "market_id is required." }, { status: 400 });
    }

    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id,is_default,default_locale_id")
      .eq("organization_id", targetOrganizationId)
      .eq("id", marketId)
      .maybeSingle();

    if (marketError) {
      console.error("Error loading market for update:", marketError);
      return NextResponse.json({ error: "Failed to update market" }, { status: 500 });
    }

    if (!market) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const nextName = normalizeToken(body?.name);
      if (!nextName) {
        return NextResponse.json({ error: "Market name cannot be empty." }, { status: 400 });
      }
      updatePayload.name = nextName;
    }

    if (Object.prototype.hasOwnProperty.call(body, "code")) {
      const nextCodeRaw = normalizeToken(body?.code);
      const nextCode = nextCodeRaw ? normalizeMarketCode(nextCodeRaw) : null;
      if (!nextCode) {
        return NextResponse.json({ error: "Market code cannot be empty." }, { status: 400 });
      }
      updatePayload.code = nextCode;
    }

    if (Object.prototype.hasOwnProperty.call(body, "currency_code")) {
      const nextCurrency = normalizeToken(body?.currency_code);
      const normalizedCurrency = nextCurrency ? nextCurrency.toUpperCase() : null;
      if (normalizedCurrency && !isSupportedMarketCurrency(normalizedCurrency)) {
        return NextResponse.json(
          { error: "Unsupported currency code for market." },
          { status: 400 }
        );
      }
      updatePayload.currency_code = normalizedCurrency;
    }

    if (Object.prototype.hasOwnProperty.call(body, "timezone")) {
      const normalizedTimezone = normalizeToken(body?.timezone);
      if (normalizedTimezone && !isSupportedMarketTimezone(normalizedTimezone)) {
        return NextResponse.json(
          { error: "Unsupported timezone for market." },
          { status: 400 }
        );
      }
      updatePayload.timezone = normalizedTimezone;
    }

    if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
      updatePayload.is_active = Boolean(body?.is_active);
    }

    if (Object.prototype.hasOwnProperty.call(body, "default_locale_id")) {
      const requestedDefaultLocaleId = normalizeToken(body?.default_locale_id);
      if (requestedDefaultLocaleId) {
        const { data: locale, error: localeError } = await supabase
          .from("locales")
          .select("id,is_active")
          .eq("organization_id", targetOrganizationId)
          .eq("id", requestedDefaultLocaleId)
          .maybeSingle();

        if (localeError || !locale || !locale.is_active) {
          return NextResponse.json({ error: "Invalid default language selected." }, { status: 400 });
        }

        const { data: assignment, error: assignmentError } = await supabase
          .from("market_locales")
          .select("id")
          .eq("market_id", marketId)
          .eq("locale_id", requestedDefaultLocaleId)
          .eq("is_active", true)
          .maybeSingle();

        if (assignmentError || !assignment) {
          return NextResponse.json(
            { error: "Default language must be assigned to this market and active." },
            { status: 400 }
          );
        }

        updatePayload.default_locale_id = requestedDefaultLocaleId;
      } else {
        updatePayload.default_locale_id = null;
      }
    }

    const requestedIsDefault =
      Object.prototype.hasOwnProperty.call(body, "is_default")
        ? Boolean(body?.is_default)
        : null;

    if (requestedIsDefault === true) {
      const { error: clearDefaultError } = await supabase
        .from("markets")
        .update({ is_default: false })
        .eq("organization_id", targetOrganizationId);

      if (clearDefaultError) {
        console.error("Error clearing existing default markets:", clearDefaultError);
        return NextResponse.json({ error: "Failed to update market" }, { status: 500 });
      }
      updatePayload.is_default = true;
    } else if (requestedIsDefault === false) {
      updatePayload.is_default = false;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No valid fields provided for update." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("markets")
      .update(updatePayload)
      .eq("organization_id", targetOrganizationId)
      .eq("id", marketId)
      .select("id,code,name,is_active,is_default,currency_code,timezone,default_locale_id")
      .maybeSingle();

    if (error) {
      if (error.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "A market with this code already exists." },
          { status: 409 }
        );
      }
      console.error("Error updating market:", error);
      return NextResponse.json({ error: "Failed to update market" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in markets PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
