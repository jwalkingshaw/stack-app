import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess, setDatabaseUserContext } from "@/lib/user-context";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fields that live directly on the products table (base/unscoped only)
const SYSTEM_PRODUCT_COLUMNS = new Set([
  "product_name", "sku", "barcode", "status", "brand_line",
  "msrp", "cost_of_goods", "margin_percent",
  "short_description", "long_description", "features",
  "meta_title", "meta_description", "keywords",
]);

type ScopeInput = {
  localeId?: string | null;
  marketId?: string | null;
  channelId?: string | null;
  destinationId?: string | null;
};

type ChangeItem = {
  productId: string;
  fieldCode: string;
  value: unknown;
  scope?: ScopeInput;
};

type FieldValueRecord = {
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_datetime: string | null;
  value_json: unknown;
  locale_id: string | null;
  market_id: string | null;
  channel_id: string | null;
  destination_id: string | null;
  updated_at: string;
};

function buildValueRecord(value: unknown, fieldType: string): FieldValueRecord {
  const base: FieldValueRecord = {
    value_text: null, value_number: null, value_boolean: null,
    value_date: null, value_datetime: null, value_json: null,
    locale_id: null, market_id: null, channel_id: null, destination_id: null,
    updated_at: new Date().toISOString(),
  };
  if (value === null || value === undefined) return base;
  switch (fieldType) {
    case "number":
      base.value_number = typeof value === "number" ? value : parseFloat(String(value));
      break;
    case "boolean":
      base.value_boolean = Boolean(value);
      break;
    case "date":
      base.value_date = String(value);
      break;
    case "datetime":
    case "timestamp":
      base.value_datetime = String(value);
      break;
    case "select":
    case "multiselect":
      if (typeof value === "object" && value !== null) {
        base.value_json = value;
      } else {
        base.value_text = String(value);
      }
      break;
    default:
      base.value_text = String(value);
  }
  return base;
}

/**
 * POST /api/[tenant]/products/bulk-field-update
 *
 * Saves multiple field changes across multiple products in one request.
 * Handles both:
 *  - System base fields (products table columns, no scope)
 *  - Scoped/custom fields (product_field_values, with locale/market scope)
 *
 * Body: { changes: [{ productId, fieldCode, value, scope? }] }
 * Response: { ok, applied, failed: [{ productId, fieldCode, error }] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;

    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant, "collaborate");
    if (!access.hasAccess) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    const organizationId = access.organizationId!;

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const body = await request.json() as { changes?: unknown };
    if (!Array.isArray(body.changes) || !body.changes.length) {
      return NextResponse.json({ ok: true, applied: 0, failed: [] });
    }
    const changes = body.changes as ChangeItem[];

    // Pre-load custom field definitions in one query
    const customCodes = [...new Set(
      changes.filter((c) => !SYSTEM_PRODUCT_COLUMNS.has(c.fieldCode)).map((c) => c.fieldCode)
    )];
    const fieldMap = new Map<string, { id: string; field_type: string }>();
    if (customCodes.length > 0) {
      const { data: fields } = await supabase
        .from("product_fields")
        .select("id, code, field_type")
        .eq("organization_id", organizationId)
        .in("code", customCodes)
        .eq("is_active", true);
      fields?.forEach((f) => fieldMap.set(f.code as string, { id: f.id as string, field_type: f.field_type as string }));
    }

    const applied: string[] = [];
    const failed: Array<{ productId: string; fieldCode: string; error: string }> = [];

    for (const change of changes) {
      const { productId, fieldCode, value, scope = {} } = change;
      const {
        localeId = null, marketId = null,
        channelId = null, destinationId = null,
      } = scope;
      const isBaseScope = !localeId && !marketId && !channelId && !destinationId;
      const isSystemField = SYSTEM_PRODUCT_COLUMNS.has(fieldCode);

      try {
        if (isSystemField && isBaseScope) {
          // Write directly to products table
          const { error } = await supabase
            .from("products")
            .update({ [fieldCode]: value, updated_at: new Date().toISOString() })
            .eq("id", productId)
            .eq("organization_id", organizationId);
          if (error) throw new Error(error.message);

        } else {
          // Write to product_field_values (scoped or custom)
          let productFieldId: string | undefined;

          if (isSystemField) {
            // System field with scope — look up or create the product_fields entry
            const { data: existing } = await supabase
              .from("product_fields")
              .select("id")
              .eq("organization_id", organizationId)
              .eq("code", fieldCode)
              .maybeSingle();

            if (existing?.id) {
              productFieldId = existing.id as string;
            } else {
              const { data: created, error: createError } = await supabase
                .from("product_fields")
                .insert({
                  organization_id: organizationId,
                  code: fieldCode,
                  name: fieldCode.replace(/_/g, " "),
                  field_type: "text",
                  field_class: "system",
                  system_key: fieldCode,
                  is_localizable: true,
                  scope_policy: "locale",
                  value_storage_strategy: "product_column",
                  is_active: true,
                  sort_order: 0,
                })
                .select("id")
                .single();
              if (createError) throw new Error(createError.message);
              productFieldId = created?.id as string;
            }
          } else {
            productFieldId = fieldMap.get(fieldCode)?.id;
          }

          if (!productFieldId) {
            throw new Error(`Field "${fieldCode}" not found or inactive`);
          }

          const fieldType = fieldMap.get(fieldCode)?.field_type ?? "text";
          const record: FieldValueRecord = {
            ...buildValueRecord(value, fieldType),
            locale_id: localeId ?? null,
            market_id: marketId ?? null,
            channel_id: channelId ?? null,
            destination_id: destinationId ?? null,
          };

          // Scope-aware lookup for existing row
          let lookupQuery = supabase
            .from("product_field_values")
            .select("id")
            .eq("product_id", productId)
            .eq("product_field_id", productFieldId);
          lookupQuery = localeId ? lookupQuery.eq("locale_id", localeId) : lookupQuery.is("locale_id", null);
          lookupQuery = marketId ? lookupQuery.eq("market_id", marketId) : lookupQuery.is("market_id", null);
          lookupQuery = channelId ? lookupQuery.eq("channel_id", channelId) : lookupQuery.is("channel_id", null);
          lookupQuery = destinationId ? lookupQuery.eq("destination_id", destinationId) : lookupQuery.is("destination_id", null);

          const { data: existingRow } = await lookupQuery.maybeSingle();

          if (existingRow?.id) {
            const { error } = await supabase
              .from("product_field_values")
              .update(record)
              .eq("id", existingRow.id);
            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase
              .from("product_field_values")
              .insert({ product_id: productId, product_field_id: productFieldId, ...record });
            if (error) {
              if (error.code === "23505") {
                // Concurrent insert — retry as update
                const { data: retryRow } = await lookupQuery.maybeSingle();
                if (retryRow?.id) {
                  const { error: retryError } = await supabase
                    .from("product_field_values")
                    .update(record)
                    .eq("id", retryRow.id);
                  if (retryError) throw new Error(retryError.message);
                }
              } else {
                throw new Error(error.message);
              }
            }
          }
        }

        applied.push(`${productId}::${fieldCode}`);
      } catch (err) {
        failed.push({
          productId,
          fieldCode,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({ ok: true, applied: applied.length, failed });
  } catch (error) {
    console.error("[bulk-field-update] unhandled error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
