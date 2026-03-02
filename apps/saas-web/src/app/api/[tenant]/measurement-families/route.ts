import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FAMILY_SELECT_WITH_META = `
  id,
  code,
  name,
  description,
  standard_unit_id,
  is_active,
  is_composite,
  component_schema,
  default_decimal_precision,
  allow_negative,
  metadata,
  measurement_units (
    id,
    code,
    name,
    symbol,
    conversion_factor,
    is_active
  )
`;

const FAMILY_SELECT_LEGACY = `
  id,
  code,
  name,
  description,
  standard_unit_id,
  is_active,
  measurement_units (
    id,
    code,
    name,
    symbol,
    conversion_factor,
    is_active
  )
`;

function isMissingColumnError(error: any): boolean {
  return error?.code === "42703";
}

function isMissingTableError(error: any): boolean {
  return error?.code === "42P01";
}

// GET /api/[tenant]/measurement-families
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

    const runQuery = (selectClause: string) =>
      supabase
        .from("measurement_families")
        .select(selectClause)
        .eq("organization_id", targetOrganizationId)
        .eq("is_active", true)
        .order("name", { ascending: true });

    let result = await runQuery(FAMILY_SELECT_WITH_META);
    if (isMissingColumnError(result.error)) {
      result = await runQuery(FAMILY_SELECT_LEGACY);
    }

    if (result.error) {
      if (isMissingTableError(result.error)) {
        return NextResponse.json([]);
      }
      console.error("Error fetching measurement families:", result.error);
      return NextResponse.json({ error: "Failed to fetch measurement families" }, { status: 500 });
    }

    const normalized = (result.data || []).map((family: any) => {
      const units = (Array.isArray(family.measurement_units) ? family.measurement_units : [])
        .filter((unit: any) => unit?.is_active !== false)
        .map((unit: any) => ({
          id: unit.id,
          code: unit.code,
          name: unit.name,
          symbol: unit.symbol,
          conversion_factor: unit.conversion_factor,
          is_active: unit.is_active ?? true,
        }));

      const standardUnit =
        units.find((unit: any) => unit.id === family.standard_unit_id) || null;

      return {
        id: family.id,
        code: family.code,
        name: family.name,
        description: family.description,
        is_composite: family.is_composite ?? false,
        component_schema: Array.isArray(family.component_schema)
          ? family.component_schema
          : [],
        default_decimal_precision:
          typeof family.default_decimal_precision === "number"
            ? family.default_decimal_precision
            : null,
        allow_negative: family.allow_negative ?? false,
        metadata:
          family.metadata && typeof family.metadata === "object"
            ? family.metadata
            : {},
        standard_unit: standardUnit
          ? {
              id: standardUnit.id,
              code: standardUnit.code,
              name: standardUnit.name,
              symbol: standardUnit.symbol,
              conversion_factor: standardUnit.conversion_factor,
            }
          : null,
        measurement_units: units,
      };
    });

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Error in measurement families GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

