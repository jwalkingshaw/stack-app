import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRODUCT_FIELDS_SELECT_WITH_SCOPES = `
  id,
  organization_id,
  code,
  name,
  description,
  field_type,
  is_required,
  is_unique,
  is_localizable,
  is_channelable,
  allowed_channel_ids,
  allowed_market_ids,
  allowed_locale_ids,
  sort_order,
  default_value,
  validation_rules,
  options,
  is_translatable,
  is_write_assist_enabled,
  translation_content_type,
  is_active,
  created_at,
  updated_at
`;

const PRODUCT_FIELDS_SELECT_LEGACY = `
  id,
  organization_id,
  code,
  name,
  description,
  field_type,
  is_required,
  is_unique,
  is_localizable,
  is_channelable,
  sort_order,
  default_value,
  validation_rules,
  options,
  is_active,
  created_at,
  updated_at
`;

function isMissingColumnError(error: any): boolean {
  return error?.code === "42703";
}

// GET /api/[tenant]/product-fields
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
        .from("product_fields")
        .select(selectClause)
        .eq("organization_id", targetOrganizationId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

    let result = await runQuery(PRODUCT_FIELDS_SELECT_WITH_SCOPES);
    if (isMissingColumnError(result.error)) {
      result = await runQuery(PRODUCT_FIELDS_SELECT_LEGACY);
    }

    if (result.error) {
      console.error("Error fetching product fields:", result.error);
      return NextResponse.json({ error: "Failed to fetch product fields" }, { status: 500 });
    }

    const normalized = (result.data || []).map((field: any) => ({
      ...field,
      allowed_channel_ids: Array.isArray(field.allowed_channel_ids) ? field.allowed_channel_ids : [],
      allowed_market_ids: Array.isArray(field.allowed_market_ids) ? field.allowed_market_ids : [],
      allowed_locale_ids: Array.isArray(field.allowed_locale_ids) ? field.allowed_locale_ids : [],
      is_translatable: Boolean(field.is_translatable),
      is_write_assist_enabled: Boolean(field.is_write_assist_enabled),
      translation_content_type:
        typeof field.translation_content_type === "string" && field.translation_content_type.trim().length > 0
          ? field.translation_content_type
          : "other",
    }));

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Error in product fields GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
