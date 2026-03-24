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

type PostgrestLikeError = { code?: string | null } | null | undefined;

type ProductFieldRow = Record<string, unknown> & {
  id?: string;
  code?: string;
  name?: string;
  allowed_channel_ids?: unknown;
  allowed_market_ids?: unknown;
  allowed_locale_ids?: unknown;
  is_translatable?: unknown;
  is_write_assist_enabled?: unknown;
  translation_content_type?: unknown;
};

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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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

function buildFieldPayload(body: unknown): { payload: Record<string, unknown>; error?: string } {
  const record = asRecord(body);
  const nameRaw = typeof record.name === "string" ? record.name.trim() : "";
  const codeRaw = typeof record.code === "string" ? record.code : nameRaw;
  const code = normalizeCode(codeRaw);
  const fieldType = typeof record.field_type === "string" ? record.field_type.trim().toLowerCase() : "";

  if (!nameRaw) {
    return { payload: {}, error: "Attribute name is required." };
  }

  if (!code) {
    return { payload: {}, error: "Attribute code is required." };
  }

  if (!fieldType) {
    return { payload: {}, error: "Field type is required." };
  }

  const options = asRecord(record.options);
  const tableDefinition = asRecord(record.table_definition);
  if (Object.keys(tableDefinition).length > 0 && !options.table_definition) {
    options.table_definition = tableDefinition;
  }

  const payload: Record<string, unknown> = {
    code,
    name: nameRaw,
    description: typeof record.description === "string" ? record.description.trim() || null : null,
    field_type: fieldType,
    is_required: record.is_required === true,
    is_unique: record.is_unique === true,
    is_localizable: record.is_localizable === true,
    is_channelable: record.is_channelable === true,
    allowed_channel_ids: toStringArray(record.allowed_channel_ids),
    allowed_market_ids: toStringArray(record.allowed_market_ids),
    allowed_locale_ids: toStringArray(record.allowed_locale_ids),
    sort_order: Number.isFinite(Number(record.sort_order)) ? Number(record.sort_order) : 1,
    default_value:
      typeof record.default_value === "string"
        ? record.default_value
        : record.default_value === null
          ? null
          : "",
    validation_rules: asRecord(record.validation_rules),
    options,
    is_translatable: record.is_translatable === true,
    is_write_assist_enabled: record.is_write_assist_enabled === true,
    translation_content_type:
      typeof record.translation_content_type === "string" && record.translation_content_type.trim().length > 0
        ? record.translation_content_type.trim().toLowerCase()
        : "other",
    is_active: record.is_active !== false,
  };

  return { payload };
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

async function fetchProductFieldById(organizationId: string, id: string) {
  const runQuery = (selectClause: string) =>
    supabase
      .from("product_fields")
      .select(selectClause)
      .eq("organization_id", organizationId)
      .eq("id", id)
      .single();

  let result = await runQuery(PRODUCT_FIELDS_SELECT_WITH_SCOPES);
  if (isMissingColumnError(result.error)) {
    result = await runQuery(PRODUCT_FIELDS_SELECT_LEGACY);
  }

  return result;
}

// GET /api/[tenant]/product-fields
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;

    const contextResult = await resolveContext(request, tenant);
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const runQuery = (selectClause: string) =>
      supabase
        .from("product_fields")
        .select(selectClause)
        .eq("organization_id", contextResult.targetOrganizationId)
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

    const normalized = (((result.data || []) as unknown) as ProductFieldRow[]).map((field) =>
      normalizeProductFieldRow(field)
    );

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Error in product fields GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/product-fields
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
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
    const built = buildFieldPayload(body);
    if (built.error) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }

    const payload = {
      ...built.payload,
      organization_id: contextResult.targetOrganizationId,
    };

    let insertResult = await supabase
      .from("product_fields")
      .insert(payload)
      .select("id")
      .single();

    if (isMissingColumnError(insertResult.error)) {
      insertResult = await supabase
        .from("product_fields")
        .insert(toLegacyPayload(payload))
        .select("id")
        .single();
    }

    if (insertResult.error || !insertResult.data?.id) {
      if (insertResult.error?.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "An attribute with this code already exists." },
          { status: 409 }
        );
      }

      console.error("Error creating product field:", insertResult.error);
      return NextResponse.json({ error: "Failed to create attribute" }, { status: 500 });
    }

    const fieldResult = await fetchProductFieldById(
      contextResult.targetOrganizationId,
      insertResult.data.id as string
    );

    if (fieldResult.error || !fieldResult.data) {
      console.error("Error fetching created product field:", fieldResult.error);
      return NextResponse.json({ error: "Attribute created but failed to load" }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        data: normalizeProductFieldRow(fieldResult.data as unknown as ProductFieldRow),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in product fields POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
