import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { normalizeProductFieldOptions } from "@/lib/product-field-options";


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
  field_class,
  system_key,
  is_locked,
  is_override_capable,
  scope_policy,
  data_domain,
  value_storage_strategy,
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
  field_class?: unknown;
  system_key?: unknown;
  is_locked?: unknown;
  is_override_capable?: unknown;
  scope_policy?: unknown;
  data_domain?: unknown;
  value_storage_strategy?: unknown;
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
  const normalizedFieldType = typeof field.field_type === "string" ? field.field_type : "";
  const normalizedOptionsResult = normalizeProductFieldOptions({
    fieldType: normalizedFieldType,
    options: field.options,
    defaultValue: field.default_value,
  });
  const options = normalizedOptionsResult.options;
  return {
    ...field,
    options,
    default_value:
      normalizedFieldType === "select" ? (normalizedOptionsResult.defaultValue as string | null) ?? null : field.default_value,
    allowed_channel_ids: Array.isArray(field.allowed_channel_ids) ? field.allowed_channel_ids : [],
    allowed_market_ids: Array.isArray(field.allowed_market_ids) ? field.allowed_market_ids : [],
    allowed_locale_ids: Array.isArray(field.allowed_locale_ids) ? field.allowed_locale_ids : [],
    field_class:
      typeof field.field_class === "string" && field.field_class.trim().length > 0
        ? field.field_class
        : options.is_system === true
          ? "system"
          : "custom",
    system_key: typeof field.system_key === "string" ? field.system_key : null,
    is_locked: Boolean(field.is_locked),
    is_override_capable: Boolean(field.is_override_capable),
    scope_policy:
      typeof field.scope_policy === "string" && field.scope_policy.trim().length > 0
        ? field.scope_policy
        : "base",
    data_domain:
      typeof field.data_domain === "string" && field.data_domain.trim().length > 0
        ? field.data_domain
        : "general",
    value_storage_strategy:
      typeof field.value_storage_strategy === "string" && field.value_storage_strategy.trim().length > 0
        ? field.value_storage_strategy
        : "field_value",
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
  delete next.field_class;
  delete next.system_key;
  delete next.is_locked;
  delete next.is_override_capable;
  delete next.scope_policy;
  delete next.data_domain;
  delete next.value_storage_strategy;
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
    getSupabaseServer()
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

function buildUpdatePayload(
  body: unknown,
  existingFieldType?: string,
  existingOptions?: unknown,
  existingDefaultValue?: unknown
): { payload: Record<string, unknown>; hasValues: boolean; error?: string } {
  const record = asRecord(body);
  const payload: Record<string, unknown> = {};
  const nextFieldType =
    typeof record.field_type === "string"
      ? record.field_type.trim().toLowerCase()
      : String(existingFieldType || "").trim().toLowerCase();

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
    payload.field_type = nextFieldType;
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
      nextFieldType === "select"
        ? record.default_value
        : typeof record.default_value === "string"
          ? record.default_value
          : record.default_value === null
            ? null
            : "";
  }

  if (record.validation_rules !== undefined) {
    payload.validation_rules = asRecord(record.validation_rules);
  }

  if (record.options !== undefined) {
    const normalizedOptionsResult = normalizeProductFieldOptions({
      fieldType: nextFieldType,
      options: record.options,
      defaultValue: record.default_value ?? existingDefaultValue,
    });
    if (normalizedOptionsResult.error) {
      return { payload: {}, hasValues: false, error: normalizedOptionsResult.error };
    }
    payload.options = normalizedOptionsResult.options;
    if (nextFieldType === "select") {
      payload.default_value = (normalizedOptionsResult.defaultValue as string | null) ?? null;
    }
  }

  if (record.options === undefined && record.default_value !== undefined && nextFieldType === "select") {
    const normalizedDefaultResult = normalizeProductFieldOptions({
      fieldType: nextFieldType,
      options: existingOptions,
      defaultValue: record.default_value,
    });
    if (normalizedDefaultResult.error) {
      return { payload: {}, hasValues: false, error: normalizedDefaultResult.error };
    }
    payload.default_value = (normalizedDefaultResult.defaultValue as string | null) ?? null;
  }

  if (typeof record.field_class === "string") {
    payload.field_class = record.field_class.trim().toLowerCase();
  }

  if (record.system_key !== undefined) {
    payload.system_key =
      typeof record.system_key === "string" && record.system_key.trim().length > 0
        ? record.system_key.trim()
        : null;
  }

  if (typeof record.is_locked === "boolean") {
    payload.is_locked = record.is_locked;
  }

  if (typeof record.is_override_capable === "boolean") {
    payload.is_override_capable = record.is_override_capable;
  }

  if (typeof record.scope_policy === "string") {
    payload.scope_policy = record.scope_policy.trim().toLowerCase();
  }

  if (typeof record.data_domain === "string") {
    payload.data_domain = record.data_domain.trim().toLowerCase();
  }

  if (typeof record.value_storage_strategy === "string") {
    payload.value_storage_strategy = record.value_storage_strategy.trim().toLowerCase();
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

// GET /api/[tenant]/product-fields/[fieldId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; fieldId: string }> }
) {
  try {
    const { tenant, fieldId } = await params;
    const contextResult = await resolveContext(request, tenant);
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const fieldResult = await fetchProductFieldById(contextResult.targetOrganizationId, fieldId);

    if (fieldResult.error?.code === "PGRST116" || !fieldResult.data) {
      return NextResponse.json({ error: "Attribute not found." }, { status: 404 });
    }

    return NextResponse.json({
      data: normalizeProductFieldRow(fieldResult.data as unknown as ProductFieldRow),
    });
  } catch (error) {
    console.error("Error in product field GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
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

    

    const existingFieldResult = await fetchProductFieldById(
      contextResult.targetOrganizationId,
      fieldId
    );

    if (existingFieldResult.error?.code === "PGRST116" || !existingFieldResult.data) {
      return NextResponse.json({ error: "Attribute not found." }, { status: 404 });
    }

    const existingField = normalizeProductFieldRow(
      existingFieldResult.data as unknown as ProductFieldRow
    );
    const body = await request.json();
    const built = buildUpdatePayload(
      body,
      String(existingField.field_type || ""),
      existingField.options,
      existingField.default_value
    );
    if (built.error) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }
    if (!built.hasValues) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    if (typeof built.payload.name === "string" && built.payload.name.trim().length === 0) {
      return NextResponse.json({ error: "Attribute name cannot be empty." }, { status: 400 });
    }

    if (typeof built.payload.code === "string" && built.payload.code.trim().length === 0) {
      return NextResponse.json({ error: "Attribute code cannot be empty." }, { status: 400 });
    }
    const isLockedField = existingField.is_locked === true || existingField.field_class !== "custom";

    if (isLockedField) {
      delete built.payload.code;
      delete built.payload.field_type;
      delete built.payload.field_class;
      delete built.payload.system_key;
      delete built.payload.is_locked;
      delete built.payload.scope_policy;
      delete built.payload.data_domain;
      delete built.payload.value_storage_strategy;
    }

    let updateResult = await getSupabaseServer()
      .from("product_fields")
      .update(built.payload)
      .eq("id", fieldId)
      .eq("organization_id", contextResult.targetOrganizationId)
      .select("id")
      .single();

    if (isMissingColumnError(updateResult.error)) {
      updateResult = await getSupabaseServer()
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

    const existingFieldResult = await fetchProductFieldById(
      contextResult.targetOrganizationId,
      fieldId
    );

    if (existingFieldResult.error?.code === "PGRST116" || !existingFieldResult.data) {
      return NextResponse.json({ error: "Attribute not found." }, { status: 404 });
    }

    const existingField = normalizeProductFieldRow(
      existingFieldResult.data as unknown as ProductFieldRow
    );
    if (existingField.is_locked === true || existingField.field_class !== "custom") {
      return NextResponse.json(
        { error: "System and output attributes cannot be deleted." },
        { status: 403 }
      );
    }

    const { data, error } = await getSupabaseServer()
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

