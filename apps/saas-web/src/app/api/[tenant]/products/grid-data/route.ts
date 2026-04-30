import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";


/**
 * GET /api/[tenant]/products/grid-data
 *
 * Fetches product_field_values for the requested products, field codes, and locale/market scopes.
 * Used by the PIM grid to populate locale-scoped columns (Phase 3).
 *
 * Query params:
 *   productIds  - comma-separated product UUIDs
 *   fieldCodes  - comma-separated field codes (e.g. short_description,caffeine_content)
 *   localeIds   - comma-separated locale UUIDs (optional)
 *   marketIds   - comma-separated market UUIDs (optional)
 *
 * Response:
 *   { data: { [productId]: { "[fieldCode]::[localeId]": value, ... } } }
 *   Base scope (no locale) is keyed as just "[fieldCode]".
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const url = new URL(request.url);

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
    });
    if (!contextResult.ok) return contextResult.response;
    const { context } = contextResult;
    const organizationId = context.targetOrganization.id;

    const productIds = (url.searchParams.get("productIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const fieldCodes = (url.searchParams.get("fieldCodes") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const localeIds = (url.searchParams.get("localeIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!productIds.length || !fieldCodes.length) {
      return NextResponse.json({ data: {} });
    }

    // Resolve product_field_id for each requested code
    const { data: fields, error: fieldsError } = await getSupabaseServer()
      .from("product_fields")
      .select("id, code, field_type")
      .eq("organization_id", organizationId)
      .in("code", fieldCodes)
      .eq("is_active", true);

    if (fieldsError) {
      console.error("[grid-data] field lookup error:", fieldsError);
      return NextResponse.json({ error: "Failed to resolve fields" }, { status: 500 });
    }

    if (!fields?.length) {
      return NextResponse.json({ data: {} });
    }

    const fieldById = new Map(fields.map((f) => [f.id as string, f]));
    const fieldIds = fields.map((f) => f.id as string);

    // Fetch product_field_values for the requested scope(s)
    // Fetch all rows matching product_ids + field_ids; filter scopes client-side
    // (getSupabaseServer() OR filters with IS NULL are tricky; fetching slightly more is fine at this scale)
    const { data: values, error: valuesError } = await getSupabaseServer()
      .from("product_field_values")
      .select(
        "product_id, product_field_id, value_text, value_number, value_boolean, value_date, value_datetime, value_json, locale_id, market_id"
      )
      .in("product_id", productIds)
      .in("product_field_id", fieldIds);

    if (valuesError) {
      console.error("[grid-data] values fetch error:", valuesError);
      return NextResponse.json({ error: "Failed to fetch field values" }, { status: 500 });
    }

    const requestedLocaleSet = new Set(localeIds);

    // Build response: { productId: { "fieldCode::localeId": value } }
    const result: Record<string, Record<string, unknown>> = {};

    for (const row of values ?? []) {
      const field = fieldById.get(row.product_field_id as string);
      if (!field) continue;

      const productId = row.product_id as string;
      const fieldCode = field.code as string;
      const rowLocaleId = (row.locale_id as string | null) ?? null;

      // Only include rows that match the requested locales (or base scope)
      if (rowLocaleId && requestedLocaleSet.size > 0 && !requestedLocaleSet.has(rowLocaleId)) {
        continue;
      }

      // Resolve the scalar value
      const value =
        (row.value_text as unknown) ??
        (row.value_number as unknown) ??
        (row.value_boolean as unknown) ??
        (row.value_date as unknown) ??
        (row.value_datetime as unknown) ??
        (row.value_json as unknown) ??
        null;

      result[productId] ??= {};

      const colKey = rowLocaleId ? `${fieldCode}::${rowLocaleId}` : fieldCode;
      result[productId][colKey] = value;
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[grid-data] unhandled error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
