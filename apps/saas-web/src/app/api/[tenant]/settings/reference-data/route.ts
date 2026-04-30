import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import {
  MARKET_CURRENCY_OPTIONS,
  MARKET_TIMEZONE_OPTIONS,
} from "@/lib/market-reference-data";
import { DEFAULT_LOCALE_CATALOG } from "@/lib/locale-catalog";


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

    const { data: countries, error: countriesError } = await getSupabaseServer()
      .from("countries")
      .select("code,name")
      .order("name", { ascending: true });

    if (countriesError) {
      console.error("Failed to fetch countries for reference-data:", countriesError);
      return NextResponse.json(
        { error: "Failed to fetch reference data" },
        { status: 500 }
      );
    }

    const { data: localeCatalogRows, error: localeCatalogError } = await getSupabaseServer()
      .from("locale_catalog")
      .select("code,name,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    const localeCatalog =
      localeCatalogError?.code === "42P01"
        ? DEFAULT_LOCALE_CATALOG
        : (localeCatalogRows || []).map((row) => ({
            code: row.code,
            name: row.name,
            sort_order: row.sort_order ?? 1000,
          }));

    if (localeCatalogError && localeCatalogError.code !== "42P01") {
      console.error("Failed to fetch locale catalog for reference-data:", localeCatalogError);
      return NextResponse.json(
        { error: "Failed to fetch reference data" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      version: "2026-03-18",
      countries: countries || [],
      currencies: MARKET_CURRENCY_OPTIONS,
      timezones: MARKET_TIMEZONE_OPTIONS,
      locale_catalog: localeCatalog,
      locale_code_validation: {
        format: "BCP-47-ish",
        examples: ["en", "en-US", "es-MX", "pt-BR", "zh-Hant"],
      },
    });
  } catch (error) {
    console.error("Error in reference-data GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
