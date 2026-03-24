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

const MISSING_COLUMN_ERROR = "42703";
const UNIQUE_VIOLATION_ERROR = "23505";
const FK_VIOLATION_ERROR = "23503";

type PostgrestLikeError = { code?: string | null } | null | undefined;
type ProductFieldRow = Record<string, unknown> & {
  allowed_channel_ids?: unknown;
  allowed_market_ids?: unknown;
  allowed_locale_ids?: unknown;
  is_translatable?: unknown;
  is_write_assist_enabled?: unknown;
  translation_content_type?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized) continue;
    deduped.add(normalized);
  }
  return Array.from(deduped);
}

function isMissingColumnError(error: PostgrestLikeError): boolean {
  return error?.code === MISSING_COLUMN_ERROR;
}

function normalizeCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizeProductFieldRow(field: ProductFieldRow): ProductFieldRow {
  return {
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
  };
}

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

function toLegacyPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  delete next.allowed_channel_ids;
  delete next.allowed_market_ids;
  delete next.allowed_locale_ids;
  delete next.is_translatable;
  delete next.is_write_assist_enabled;
  delete next.translation_content_type;
  return next;
}

async function resolveContext(request: NextRequest, tenant: string) {
  const selectedBrandSlug = new URL(request.url).searchParams.get("brand");
  const contextResult = await resolveTenantBrandViewContext({
    request,
    tenantSlug: tenant,
    selectedBrandSlug,
  });

  if (!contextResult.ok) {
    return { ok: false as const, response: contextResult.response, selectedBrandSlug };
  }

  return {
    ok: true as const,
    targetOrganizationId: contextResult.context.targetOrganization.id,
    selectedBrandSlug,
  };
}

async function fetchProductFieldById(organizationId: string, fieldId: string) {
  const runQuery = (selectClause: string) =>
    supabase
      .from("product_fields")
      .select(selectClause)
      .eq("organization_id", organizationId)
      .eq("id", fieldId)
      .single();

  let result = await runQuery(PRODUCT_FIELDS_SELECT_WITH_SCOPES);
  if (isMissingColumnError(result.error)) {
    result = await runQuery(PRODUCT_FIELDS_SELECT_LEGACY);
  }

  return result;
}

function buildUpdatePayload(body: unknown): { payload: Record<string, unknown>; hasValues: boolean } {
  const record = asRecord(body);
  const payload: Record<string, unknown> = {};

  if (typeof record.name === "string") {
    payload.name = record.name.trim();
  }

  if (typeof record.code === "string") {
    payload.code = normalizeCode(record.code);
  }

  if (typeof record.description === "string") {
    payload.description = record.description.trim() || null;
  } else if (record.description === null) {
    payload.description = null;
  }

  if (typeof record.field_type === "string") {
    payload.field_type = record.field_type.trim().toLowerCase();
  }

  if (typeof record.is_required === "boolean") {
    payload.is_required = record.is_required;
  }

  if (typeof record.is_unique === "boolean") {
    payload.is_unique = record.is_unique;
  }

  if (typeof record.is_localizable === "boolean") {
    payload.is_localizable = record.is_localizable;
  }

  if (typeof record.is_channelable === "boolean") {
    payload.is_channelable = record.is_channelable;
  }

  if (record.allowed_channel_ids !== undefined) {
    payload.allowed_channel_ids = toStringArray(record.allowed_channel_ids);
  }

  if (record.allowed_market_ids !== undefined) {
    payload.allowed_market_ids = toStringArray(record.allowed_market_ids);
  }

  if (record.allowed_locale_ids !== undefined) {
    payload.allowed_locale_ids = toStringArray(record.allowed_locale_ids);
  }

  if (Number.isFinite(Number(record.sort_order))) {
    payload.sort_order = Number(record.sort_order);
  }

  if (record.default_value !== undefined) {
    payload.default_value =
      typeof record.default_value === "string"
        ? record.default_value
        : record.default_value === null
          ? null
          : "";
  }

  if (record.validation_rules !== undefined) {
    payload.validation_rules = asRecord(record.validation_rules);
  }

  if (record.options !== undefined) {
    payload.options = asRecord(record.options);
  }

  if (typeof record.is_translatable === "boolean") {
    payload.is_translatable = record.is_translatable;
  }

  if (typeof record.is_write_assist_enabled === "boolean") {
    payload.is_write_assist_enabled = record.is_write_assist_enabled;
  }

  if (typeof record.translation_content_type === "string") {
    payload.translation_content_type = record.translation_content_type.trim().toLowerCase();
  }

  if (typeof record.is_active === "boolean") {
    payload.is_active = record.is_active;
  }

  return { payload, hasValues: Object.keys(payload).length > 0 };
}

// PUT /api/[tenant]/product-fields/[fieldId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; fieldId: string }> }
) {
  try {
    const { tenant, fieldId } = await params;
    const contextResult = await resolveContext(request, tenant);
    if (!contextResult.ok) {
      return contextResult.response;
    }

    if (isCrossTenantWrite(tenant, contextResult.selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const built = buildUpdatePayload(body);
    if (!built.hasValues) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    if (typeof built.payload.name === "string" && built.payload.name.trim().length === 0) {
      return NextResponse.json({ error: "Attribute name cannot be empty." }, { status: 400 });
    }

    if (typeof built.payload.code === "string" && built.payload.code.trim().length === 0) {
      return NextResponse.json({ error: "Attribute code cannot be empty." }, { status: 400 });
    }

    let updateResult = await supabase
      .from("product_fields")
      .update(built.payload)
      .eq("id", fieldId)
      .eq("organization_id", contextResult.targetOrganizationId)
      .select("id")
      .single();

    if (isMissingColumnError(updateResult.error)) {
      updateResult = await supabase
        .from("product_fields")
        .update(toLegacyPayload(built.payload))
        .eq("id", fieldId)
        .eq("organization_id", contextResult.targetOrganizationId)
        .select("id")
        .single();
    }

    if (updateResult.error || !updateResult.data?.id) {
      if (updateResult.error?.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "An attribute with this code already exists." },
          { status: 409 }
        );
      }

      if (updateResult.error?.code === "PGRST116") {
        return NextResponse.json({ error: "Attribute not found." }, { status: 404 });
      }

      console.error("Error updating product field:", updateResult.error);
      return NextResponse.json({ error: "Failed to update attribute" }, { status: 500 });
    }

    const fieldResult = await fetchProductFieldById(contextResult.targetOrganizationId, fieldId);
    if (fieldResult.error || !fieldResult.data) {
      console.error("Error fetching updated product field:", fieldResult.error);
      return NextResponse.json({ error: "Attribute updated but failed to load" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: normalizeProductFieldRow(fieldResult.data as unknown as ProductFieldRow),
    });
  } catch (error) {
    console.error("Error in product field PUT:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/product-fields/[fieldId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; fieldId: string }> }
) {
  try {
    const { tenant, fieldId } = await params;
    const contextResult = await resolveContext(request, tenant);
    if (!contextResult.ok) {
      return contextResult.response;
    }

    if (isCrossTenantWrite(tenant, contextResult.selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("product_fields")
      .delete()
      .eq("id", fieldId)
      .eq("organization_id", contextResult.targetOrganizationId)
      .select("id")
      .single();

    if (error) {
      if (error.code === FK_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "This attribute cannot be deleted because it is still in use." },
          { status: 409 }
        );
      }

      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Attribute not found." }, { status: 404 });
      }

      console.error("Error deleting product field:", error);
      return NextResponse.json({ error: "Failed to delete attribute" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in product field DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
