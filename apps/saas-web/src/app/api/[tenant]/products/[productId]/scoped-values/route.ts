import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess, setDatabaseUserContext } from "@/lib/user-context";
import {
  resolveOrganizationBaselineScope,
  scopeMatchesOrganizationBaseline,
} from "@/lib/default-market-locale";
import { normalizeProductFieldValue } from "@/lib/product-field-options";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type FieldValueRow = {
  product_field_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_datetime: string | null;
  value_json: unknown;
  market_id: string | null;
  channel_id: string | null;
  locale_id: string | null;
  destination_id: string | null;
  product_fields:
    | {
        id: string;
        code: string;
        name?: string;
        field_type: string;
        options?: Record<string, unknown> | null;
        organization_id: string;
      }
    | Array<{
        id: string;
        code: string;
        name?: string;
        field_type: string;
        options?: Record<string, unknown> | null;
        organization_id: string;
      }>
    | null;
};

function toTypedFieldValue(row: FieldValueRow): unknown {
  return (
    row.value_text ??
    row.value_number ??
    row.value_boolean ??
    row.value_date ??
    row.value_datetime ??
    row.value_json ??
    null
  );
}

function resolveJoinedField(row: FieldValueRow) {
  if (!row.product_fields) return null;
  return Array.isArray(row.product_fields) ? row.product_fields[0] ?? null : row.product_fields;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant);
    if (!access.hasAccess || !access.organizationId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    await setDatabaseUserContext(user.id, access.organizationId);
    const baselineScope = await resolveOrganizationBaselineScope(supabase, access.organizationId);

    const { data: productRow, error: productError } = await supabase
      .from("products")
      .select("id, organization_id")
      .eq("id", productId)
      .eq("organization_id", access.organizationId)
      .maybeSingle();

    if (productError || !productRow) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("product_field_values")
      .select(
        "product_field_id,value_text,value_number,value_boolean,value_date,value_datetime,value_json,market_id,channel_id,locale_id,destination_id,product_fields!inner(id,code,name,field_type,options,organization_id)"
      )
      .eq("product_id", productId)
      .eq("product_fields.organization_id", access.organizationId);

    if (error) {
      console.error("Failed to load scoped product field values:", error);
      return NextResponse.json({ error: "Failed to load scoped field values" }, { status: 500 });
    }

    const grouped: Record<
      string,
      Array<{
        fieldId: string;
        fieldType: string;
        value: unknown;
        marketId: string | null;
        localeId: string | null;
        channelId: string | null;
        destinationId: string | null;
      }>
    > = {};

    ((data || []) as FieldValueRow[]).forEach((row) => {
      const field = resolveJoinedField(row);
      const fieldCode = String(field?.code || "").trim().toLowerCase();
      if (!fieldCode) return;

      const hasScope =
        Boolean(row.market_id) ||
        Boolean(row.locale_id) ||
        Boolean(row.channel_id) ||
        Boolean(row.destination_id);

      if (!hasScope) return;
      if (
        scopeMatchesOrganizationBaseline({
          marketId: row.market_id,
          localeId: row.locale_id,
          channelId: row.channel_id,
          destinationId: row.destination_id,
          baseline: baselineScope,
        })
      ) {
        return;
      }

      const normalizedValueResult = normalizeProductFieldValue({
        fieldType: String(field?.field_type || ""),
        options: field?.options,
        value: toTypedFieldValue(row),
        fieldLabel: typeof field?.name === "string" && field.name.trim().length > 0 ? field.name : fieldCode,
      });
      if (normalizedValueResult.error || normalizedValueResult.value === null || typeof normalizedValueResult.value === "undefined") {
        return;
      }

      grouped[fieldCode] ||= [];
      grouped[fieldCode].push({
        fieldId: String(field?.id || row.product_field_id || ""),
        fieldType: String(field?.field_type || ""),
        value: normalizedValueResult.value,
        marketId: row.market_id ?? null,
        localeId: row.locale_id ?? null,
        channelId: row.channel_id ?? null,
        destinationId: row.destination_id ?? null,
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        productId,
        valuesByFieldCode: grouped,
      },
    });
  } catch (error) {
    console.error("Error loading product scoped values:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
