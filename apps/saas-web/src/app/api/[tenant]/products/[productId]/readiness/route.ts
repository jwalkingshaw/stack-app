import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type FieldRule = {
  field_code: string;
  is_required: boolean;
  max_length: number | null;
  notes: string | null;
};

type ProfileWithRules = {
  id: string;
  name: string;
  code: string;
  profile_type: string;
  market_id: string | null;
  is_active: boolean;
  field_rules: FieldRule[];
};

type ReadinessResult = {
  profile_id: string;
  profile_name: string;
  profile_code: string;
  profile_type: string;
  total_required: number;
  complete_count: number;
  percent: number;
  is_ready: boolean;
  missing: Array<{ field_code: string; notes: string | null }>;
  warnings: Array<{ field_code: string; issue: string }>;
};

function isFieldValuePresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return false;
}

// GET /api/[tenant]/products/[productId]/readiness
// Returns readiness scores for all active output profiles
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  const { tenant, productId: rawProductId } = await params;
  // Strip slug suffix — productId may arrive as "uuid-slug" (e.g. from URL params)
  const UUID_PREFIX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
  const productId = rawProductId.match(UUID_PREFIX)?.[1] ?? rawProductId;
  const { searchParams } = request.nextUrl;
  const marketId = searchParams.get("marketId") ?? null;
  const localeId = searchParams.get("localeId") ?? null;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.targetOrganization.id;

    // Load all active output profiles with their field rules
    const profilesQuery = supabase
      .from("output_channel_profiles")
      .select(`
        id, name, code, profile_type, market_id, is_active,
        field_rules:output_profile_field_rules(field_code, is_required, max_length, notes)
      `)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    // If a marketId is provided, show profiles for that market + global profiles
    const { data: profilesRaw, error: profilesError } = await profilesQuery;

    if (profilesError) {
      console.error("Error loading output profiles:", profilesError);
      return NextResponse.json({ error: "Failed to load profiles" }, { status: 500 });
    }

    const profiles = (profilesRaw ?? []) as ProfileWithRules[];
    const relevantProfiles = marketId
      ? profiles.filter((p) => !p.market_id || p.market_id === marketId)
      : profiles;

    if (relevantProfiles.length === 0) {
      return NextResponse.json({ success: true, data: { profiles: [], product_id: productId } });
    }

    // Load all field codes referenced across all profiles
    const allFieldCodes = [
      ...new Set(
        relevantProfiles.flatMap((p) => p.field_rules.map((r) => r.field_code))
      ),
    ];

    if (allFieldCodes.length === 0) {
      const emptyResults: ReadinessResult[] = relevantProfiles.map((p) => ({
        profile_id: p.id,
        profile_name: p.name,
        profile_code: p.code,
        profile_type: p.profile_type,
        total_required: 0,
        complete_count: 0,
        percent: 100,
        is_ready: true,
        missing: [],
        warnings: [],
      }));
      return NextResponse.json({ success: true, data: { profiles: emptyResults, product_id: productId } });
    }

    // Resolve field codes → field IDs for this org
    const { data: fieldsRaw, error: fieldsError } = await supabase
      .from("product_fields")
      .select("id, code, is_localizable")
      .eq("organization_id", organizationId)
      .in("code", allFieldCodes);

    if (fieldsError) {
      console.error("Error loading product fields:", fieldsError);
      return NextResponse.json({ error: "Failed to load field definitions" }, { status: 500 });
    }

    const fieldByCode = new Map(
      (fieldsRaw ?? []).map((f) => [f.code as string, f as { id: string; code: string; is_localizable: boolean }])
    );
    const fieldIds = (fieldsRaw ?? []).map((f) => f.id as string);

    // Load product field values
    let fieldValuesRaw: Array<{
      product_field_id: string;
      value_text: string | null;
      value_number: number | null;
      value_boolean: boolean | null;
      value_json: unknown;
      locale_id: string | null;
      market_id: string | null;
    }> = [];

    if (fieldIds.length > 0) {
      const valQuery = supabase
        .from("product_field_values")
        .select("product_field_id, value_text, value_number, value_boolean, value_json, locale_id, market_id")
        .eq("product_id", productId)
        .in("product_field_id", fieldIds);

      const { data: valuesRaw, error: valuesError } = await valQuery;
      if (valuesError) {
        console.error("Error loading product field values:", valuesError);
        return NextResponse.json({ error: "Failed to load field values" }, { status: 500 });
      }
      fieldValuesRaw = valuesRaw ?? [];
    }

    // Build a set of field IDs that have a non-empty value,
    // scoped to the current market/locale context
    const populatedFieldIds = new Set<string>();
    for (const row of fieldValuesRaw) {
      // Scope filtering: if a value has a market_id, it must match
      if (row.market_id && marketId && row.market_id !== marketId) continue;
      // Scope filtering: if a value has a locale_id, it must match
      if (row.locale_id && localeId && row.locale_id !== localeId) continue;

      const val = row.value_text ?? row.value_number ?? row.value_boolean ?? row.value_json;
      if (isFieldValuePresent(val)) {
        populatedFieldIds.add(row.product_field_id);
      }
    }

    // Evaluate readiness per profile
    const results: ReadinessResult[] = relevantProfiles.map((profile) => {
      const requiredRules = profile.field_rules.filter((r) => r.is_required);
      const warnings: Array<{ field_code: string; issue: string }> = [];
      const missing: Array<{ field_code: string; notes: string | null }> = [];

      for (const rule of requiredRules) {
        const fieldDef = fieldByCode.get(rule.field_code);
        if (!fieldDef) {
          // Field doesn't exist in org — mark as missing
          missing.push({ field_code: rule.field_code, notes: rule.notes });
          continue;
        }
        if (!populatedFieldIds.has(fieldDef.id)) {
          missing.push({ field_code: rule.field_code, notes: rule.notes });
        }
      }

      // Max-length warnings (field has a value but may be too long)
      for (const rule of profile.field_rules) {
        if (!rule.max_length) continue;
        const fieldDef = fieldByCode.get(rule.field_code);
        if (!fieldDef) continue;
        if (!populatedFieldIds.has(fieldDef.id)) continue;

        // Find the actual text value to check length
        const valueRow = fieldValuesRaw.find(
          (v) => v.product_field_id === fieldDef.id && typeof v.value_text === "string"
        );
        if (valueRow?.value_text && valueRow.value_text.length > rule.max_length) {
          warnings.push({
            field_code: rule.field_code,
            issue: `Exceeds max length of ${rule.max_length} (${valueRow.value_text.length} chars)`,
          });
        }
      }

      const totalRequired = requiredRules.length;
      const completeCount = totalRequired - missing.length;
      const percent =
        totalRequired === 0 ? 100 : Math.round((completeCount / totalRequired) * 100);

      return {
        profile_id: profile.id,
        profile_name: profile.name,
        profile_code: profile.code,
        profile_type: profile.profile_type,
        total_required: totalRequired,
        complete_count: completeCount,
        percent,
        is_ready: missing.length === 0,
        missing,
        warnings,
      };
    });

    return NextResponse.json({
      success: true,
      data: { profiles: results, product_id: productId },
    });
  } catch (err) {
    console.error("Unexpected error in GET /products/[productId]/readiness:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
