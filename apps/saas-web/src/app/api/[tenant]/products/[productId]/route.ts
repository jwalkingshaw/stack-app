import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { hasOrganizationAccess, setDatabaseUserContext } from '@/lib/user-context';
import {
  PRODUCT_VIEW_PERMISSION_KEYS,
  getScopedPermissionSummary,
  resolvePartnerGrantedProductIds,
  resolveTenantBrandViewContext,
} from '@/lib/partner-brand-view';
import { getChannelScopedProductIds } from '@/lib/product-channel-scope';
import { assertBillingCapacity, isBillableSkuRecord } from '@/lib/billing-policy';
import { validateAuthoringScope } from '@/lib/authoring-scope';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRODUCT_SELECT_WITH_BARCODE = `
  id,
  scin,
  type,
  parent_id,
  has_variants,
  variant_count,
  product_name,
  sku,
  barcode,
  brand_line,
  family_id,
  variant_axis,
  status,
  launch_date,
  msrp,
  cost_of_goods,
  margin_percent,
  assets_count,
  content_score,
  short_description,
  long_description,
  features,
  specifications,
  meta_title,
  meta_description,
  keywords,
  weight_g,
  dimensions,
  inheritance,
  is_inherited,
  marketplace_content,
  created_by,
  created_at,
  updated_at,
  last_modified_by,
  product_families!family_id (
    id,
    name,
    description
  )
`;

const PRODUCT_SELECT_WITH_UPC =
  PRODUCT_SELECT_WITH_BARCODE.replace("barcode", "upc");

const PRODUCT_VARIANT_SELECT_WITH_BARCODE = `
  id,
  scin,
  type,
  product_name,
  sku,
  barcode,
  variant_axis,
  status,
  msrp,
  cost_of_goods,
  margin_percent,
  assets_count,
  content_score,
  created_at,
  updated_at
`;

const PRODUCT_VARIANT_SELECT_WITH_UPC =
  PRODUCT_VARIANT_SELECT_WITH_BARCODE.replace("barcode", "upc");

const PRODUCT_RETURN_SELECT_WITH_BARCODE = `
  id,
  scin,
  type,
  parent_id,
  has_variants,
  variant_count,
  product_name,
  sku,
  barcode,
  brand_line,
  family_id,
  variant_axis,
  status,
  launch_date,
  msrp,
  cost_of_goods,
  margin_percent,
  assets_count,
  content_score,
  created_by,
  created_at,
  updated_at,
  last_modified_by,
  product_families!family_id (
    name
  )
`;

const PRODUCT_RETURN_SELECT_WITH_UPC =
  PRODUCT_RETURN_SELECT_WITH_BARCODE.replace("barcode", "upc");

const UPC_MISSING_COLUMN_ERROR = "42703";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
const SCOPED_FIELD_CODE_CANDIDATES: Record<string, string[]> = {
  product_name: ["title", "product_name"],
  sku: ["sku"],
  barcode: ["barcode", "upc"],
  short_description: ["short_description"],
  long_description: ["long_description", "description"],
  features: ["features", "bullet_points", "bullets"],
  specifications: ["specifications"],
  keywords: ["keywords"],
  meta_title: ["meta_title", "seo_title"],
  meta_description: ["meta_description", "seo_description"],
  brand_line: ["brand_line", "brand"],
  weight_g: ["weight_g", "weight"],
  dimensions: ["dimensions"],
};
const SCOPED_EDITABLE_COLUMNS = new Set(Object.keys(SCOPED_FIELD_CODE_CANDIDATES));
const SYSTEM_FIELD_CODE_CANDIDATES = new Set(
  Object.values(SCOPED_FIELD_CODE_CANDIDATES)
    .flat()
    .map((code) => code.toLowerCase())
);
SYSTEM_FIELD_CODE_CANDIDATES.add("scin");
SYSTEM_FIELD_CODE_CANDIDATES.add("upc");

const PRODUCT_ROW_MUTABLE_COLUMNS = new Set([
  "type",
  "parent_id",
  "has_variants",
  "variant_count",
  "product_name",
  "sku",
  "barcode",
  "brand_line",
  "family_id",
  "variant_axis",
  "status",
  "launch_date",
  "msrp",
  "cost_of_goods",
  "margin_percent",
  "assets_count",
  "content_score",
  "short_description",
  "long_description",
  "features",
  "specifications",
  "meta_title",
  "meta_description",
  "keywords",
  "weight_g",
  "dimensions",
  "inheritance",
  "is_inherited",
  "marketplace_content",
  "last_modified_by",
]);

type ScopeSelection = {
  marketId: string | null;
  channelId: string | null;
  localeId: string | null;
  destinationId: string | null;
  channelCode: string | null;
  localeCode: string | null;
  destinationCode: string | null;
};

type ProductFieldRow = {
  id: string;
  code: string;
  field_type: string;
};

type ProductFieldValueRow = {
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
  channel: string | null;
  locale: string | null;
};

type ProductFieldValueWithFieldRow = ProductFieldValueRow & {
  product_fields?: ProductFieldRow | ProductFieldRow[] | null;
};

function withNormalizedBarcode<T extends Record<string, unknown> & { id: string }>(
  row: T
): T & { barcode: string | null } {
  const barcodeValue = row["barcode"];
  const upcValue = row["upc"];
  const normalizedBarcode =
    typeof barcodeValue === "string"
      ? barcodeValue
      : typeof upcValue === "string"
        ? upcValue
        : null;

  return {
    ...row,
    barcode: normalizedBarcode,
  };
}

function normalizeScopeToken(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeScopeCode(value: string | null): string | null {
  const token = normalizeScopeToken(value);
  return token ? token.toLowerCase() : null;
}

function parseScopeSelectionFromRequest(request: NextRequest): ScopeSelection {
  const searchParams = new URL(request.url).searchParams;
  return {
    marketId: normalizeScopeToken(searchParams.get("marketId")),
    channelId: normalizeScopeToken(searchParams.get("channelId")),
    localeId: normalizeScopeToken(searchParams.get("localeId")),
    destinationId: normalizeScopeToken(searchParams.get("destinationId")),
    channelCode: normalizeScopeCode(searchParams.get("channel")),
    localeCode: normalizeScopeCode(searchParams.get("locale")),
    destinationCode: normalizeScopeCode(searchParams.get("destination")),
  };
}

function hasScopedSelection(scope: ScopeSelection): boolean {
  return Boolean(
    scope.marketId ||
      scope.channelId ||
      scope.localeId ||
      scope.destinationId ||
      scope.channelCode ||
      scope.localeCode ||
      scope.destinationCode
  );
}

function hasScopedIdSelection(scope: ScopeSelection): boolean {
  return Boolean(scope.marketId || scope.channelId || scope.localeId || scope.destinationId);
}

function scoreDimensionByIdOrCode(params: {
  rowId: string | null;
  rowCode?: string | null;
  selectedId: string | null;
  selectedCode?: string | null;
  weight: number;
}): number {
  const rowCode = params.rowCode ? params.rowCode.toLowerCase() : null;
  const selectedCode = params.selectedCode ? params.selectedCode.toLowerCase() : null;

  if (params.selectedId) {
    if (params.rowId === params.selectedId) return params.weight;
    if (selectedCode && rowCode && rowCode === selectedCode) return params.weight - 4;
    if (!params.rowId && !rowCode) return 1;
    return -1000;
  }

  if (selectedCode) {
    if (rowCode && rowCode === selectedCode) return params.weight;
    if (!params.rowId && !rowCode) return 1;
    return -1000;
  }

  if (!params.rowId && !rowCode) return 2;
  return -1000;
}

function scoreScopedFieldValueRow(row: ProductFieldValueRow, scope: ScopeSelection): number {
  return (
    scoreDimensionByIdOrCode({
      rowId: row.market_id,
      selectedId: scope.marketId,
      weight: 32,
    }) +
    scoreDimensionByIdOrCode({
      rowId: row.channel_id,
      rowCode: row.channel,
      selectedId: scope.channelId,
      selectedCode: scope.channelCode,
      weight: 24,
    }) +
    scoreDimensionByIdOrCode({
      rowId: row.locale_id,
      rowCode: row.locale,
      selectedId: scope.localeId,
      selectedCode: scope.localeCode,
      weight: 24,
    }) +
    scoreDimensionByIdOrCode({
      rowId: row.destination_id,
      selectedId: scope.destinationId,
      selectedCode: scope.destinationCode,
      weight: 16,
    })
  );
}

function toTypedFieldValue(row: ProductFieldValueRow): unknown {
  if (row.value_text !== null && typeof row.value_text !== "undefined") return row.value_text;
  if (row.value_number !== null && typeof row.value_number !== "undefined") return row.value_number;
  if (row.value_boolean !== null && typeof row.value_boolean !== "undefined") return row.value_boolean;
  if (row.value_date !== null && typeof row.value_date !== "undefined") return row.value_date;
  if (row.value_datetime !== null && typeof row.value_datetime !== "undefined") return row.value_datetime;
  if (row.value_json !== null && typeof row.value_json !== "undefined") return row.value_json;
  return null;
}

function buildFieldValueWritePayload(params: {
  value: unknown;
  fieldType: string;
  scope: ScopeSelection;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    value_text: null,
    value_number: null,
    value_boolean: null,
    value_date: null,
    value_datetime: null,
    value_json: null,
    market_id: params.scope.marketId,
    channel_id: params.scope.channelId,
    locale_id: params.scope.localeId,
    destination_id: params.scope.destinationId,
    channel: params.scope.channelCode,
    locale: params.scope.localeCode,
  };

  const value = params.value;
  const fieldType = String(params.fieldType || "").toLowerCase();

  if (typeof value === "number") {
    payload.value_number = Number.isFinite(value) ? value : null;
    return payload;
  }

  if (typeof value === "boolean") {
    payload.value_boolean = value;
    return payload;
  }

  if (typeof value === "string") {
    if (fieldType === "date") {
      payload.value_date = value;
      return payload;
    }
    if (fieldType === "datetime" || fieldType === "timestamp") {
      payload.value_datetime = value;
      return payload;
    }
    payload.value_text = value;
    return payload;
  }

  if (value && typeof value === "object") {
    payload.value_json = value;
    return payload;
  }

  payload.value_text = value === null || typeof value === "undefined" ? null : String(value);
  return payload;
}

async function resolveScopedFieldMap(params: {
  organizationId: string;
  columns: string[];
}): Promise<Map<string, ProductFieldRow>> {
  const uniqueColumns = Array.from(
    new Set(
      params.columns
        .map((column) => String(column || "").trim())
        .filter((column) => column.length > 0)
    )
  );
  if (uniqueColumns.length === 0) {
    return new Map();
  }

  const candidateCodes = Array.from(
    new Set(
      uniqueColumns
        .flatMap((column) => {
          const normalizedColumn = column.toLowerCase();
          const mappedCandidates =
            SCOPED_FIELD_CODE_CANDIDATES[column] ||
            SCOPED_FIELD_CODE_CANDIDATES[normalizedColumn] ||
            [normalizedColumn];
          return mappedCandidates;
        })
        .map((code) => code.toLowerCase())
    )
  );

  if (candidateCodes.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("product_fields")
    .select("id,code,field_type")
    .eq("organization_id", params.organizationId)
    .in("code", candidateCodes);

  if (error) {
    console.error("Failed to resolve scoped product fields:", error);
    return new Map();
  }

  const byCode = new Map<string, ProductFieldRow>();
  ((data || []) as ProductFieldRow[]).forEach((row) => {
    const code = String(row.code || "").trim().toLowerCase();
    if (!code) return;
    byCode.set(code, row);
  });

  const mapped = new Map<string, ProductFieldRow>();
  uniqueColumns.forEach((column) => {
    const normalizedColumn = column.toLowerCase();
    const candidates =
      SCOPED_FIELD_CODE_CANDIDATES[column] ||
      SCOPED_FIELD_CODE_CANDIDATES[normalizedColumn] ||
      [normalizedColumn];
    for (const candidateCode of candidates) {
      const row = byCode.get(candidateCode.toLowerCase());
      if (row) {
        mapped.set(column, row);
        break;
      }
    }
  });

  return mapped;
}

async function applyScopedProductValueOverrides<T extends Record<string, unknown>>(params: {
  organizationId: string;
  product: T;
  scope: ScopeSelection;
}): Promise<T> {
  if (!hasScopedSelection(params.scope)) {
    return params.product;
  }

  const scopedColumns = Array.from(SCOPED_EDITABLE_COLUMNS);
  const fieldMap = await resolveScopedFieldMap({
    organizationId: params.organizationId,
    columns: scopedColumns,
  });
  if (fieldMap.size === 0) {
    return params.product;
  }

  const fieldIds = Array.from(new Set(Array.from(fieldMap.values()).map((row) => row.id)));
  if (fieldIds.length === 0) {
    return params.product;
  }

  const { data, error } = await supabase
    .from("product_field_values")
    .select(
      "product_field_id,value_text,value_number,value_boolean,value_date,value_datetime,value_json,market_id,channel_id,locale_id,destination_id,channel,locale"
    )
    .eq("product_id", params.product.id)
    .in("product_field_id", fieldIds);

  if (error) {
    console.error("Failed to load scoped product field values:", error);
    return params.product;
  }

  const rowsByFieldId = new Map<string, ProductFieldValueRow[]>();
  ((data || []) as ProductFieldValueRow[]).forEach((row) => {
    const fieldId = String(row.product_field_id || "");
    if (!fieldId) return;
    const existing = rowsByFieldId.get(fieldId) || [];
    existing.push(row);
    rowsByFieldId.set(fieldId, existing);
  });

  const overrides: Record<string, unknown> = {};
  fieldMap.forEach((field, column) => {
    const rows = rowsByFieldId.get(field.id) || [];
    if (rows.length === 0) return;

    const scored = rows
      .map((row) => ({ row, score: scoreScopedFieldValueRow(row, params.scope) }))
      .filter((entry) => entry.score > -500)
      .sort((a, b) => b.score - a.score);

    const winner = scored[0]?.row;
    if (!winner) return;

    const typedValue = toTypedFieldValue(winner);
    if (typedValue === null || typeof typedValue === "undefined") return;
    overrides[column] = typedValue;
  });

  if (Object.keys(overrides).length === 0) {
    return params.product;
  }

  return {
    ...params.product,
    ...overrides,
  } as T;
}

function resolveJoinedProductField(
  row: ProductFieldValueWithFieldRow
): ProductFieldRow | null {
  if (!row.product_fields) return null;
  if (Array.isArray(row.product_fields)) {
    return (row.product_fields[0] as ProductFieldRow) || null;
  }
  return row.product_fields as ProductFieldRow;
}

async function loadScopedProductFieldValueMap(params: {
  organizationId: string;
  productId: string;
  scope: ScopeSelection;
  includeSystemFields?: boolean;
}): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("product_field_values")
    .select(
      "product_field_id,value_text,value_number,value_boolean,value_date,value_datetime,value_json,market_id,channel_id,locale_id,destination_id,channel,locale,product_fields!inner(id,code,field_type,organization_id)"
    )
    .eq("product_id", params.productId)
    .eq("product_fields.organization_id", params.organizationId);

  if (error) {
    console.error("Failed to load scoped custom product field values:", error);
    return {};
  }

  const rowsByFieldCode = new Map<string, ProductFieldValueRow[]>();
  ((data || []) as ProductFieldValueWithFieldRow[]).forEach((row) => {
    const joinedField = resolveJoinedProductField(row);
    const fieldCode = String(joinedField?.code || "")
      .trim()
      .toLowerCase();
    if (!fieldCode) return;
    const existingRows = rowsByFieldCode.get(fieldCode) || [];
    existingRows.push(row);
    rowsByFieldCode.set(fieldCode, existingRows);
  });

  const resolvedValues: Record<string, unknown> = {};
  rowsByFieldCode.forEach((rows, fieldCode) => {
    if (!params.includeSystemFields && SYSTEM_FIELD_CODE_CANDIDATES.has(fieldCode)) {
      return;
    }

    const winner = rows
      .map((row) => ({ row, score: scoreScopedFieldValueRow(row, params.scope) }))
      .filter((entry) => entry.score > -500)
      .sort((a, b) => b.score - a.score)[0]?.row;

    if (!winner) return;
    const typedValue = toTypedFieldValue(winner);
    if (typedValue === null || typeof typedValue === "undefined") return;
    resolvedValues[fieldCode] = typedValue;
  });

  return resolvedValues;
}

async function persistScopedProductValueUpdates(params: {
  organizationId: string;
  productId: string;
  scope: ScopeSelection;
  updates: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string; unresolvedColumns: string[] }> {
  const scopedColumns = Object.keys(params.updates)
    .map((column) => String(column || "").trim())
    .filter((column) => column.length > 0);
  const fieldMap = await resolveScopedFieldMap({
    organizationId: params.organizationId,
    columns: scopedColumns,
  });

  const unresolvedColumns = scopedColumns.filter((column) => !fieldMap.has(column));
  if (scopedColumns.length > 0 && unresolvedColumns.length === scopedColumns.length) {
    return {
      ok: false,
      error: `No matching product fields found for update keys: ${unresolvedColumns.join(", ")}`,
      unresolvedColumns,
    };
  }

  for (const column of scopedColumns) {
    const field = fieldMap.get(column);
    if (!field) continue;
    const nextValue = params.updates[column];

    if (nextValue === null || typeof nextValue === "undefined") {
      let deleteQuery = supabase
        .from("product_field_values")
        .delete()
        .eq("product_id", params.productId)
        .eq("product_field_id", field.id);
      deleteQuery = params.scope.marketId
        ? deleteQuery.eq("market_id", params.scope.marketId)
        : deleteQuery.is("market_id", null);
      deleteQuery = params.scope.channelId
        ? deleteQuery.eq("channel_id", params.scope.channelId)
        : deleteQuery.is("channel_id", null);
      deleteQuery = params.scope.localeId
        ? deleteQuery.eq("locale_id", params.scope.localeId)
        : deleteQuery.is("locale_id", null);
      deleteQuery = params.scope.destinationId
        ? deleteQuery.eq("destination_id", params.scope.destinationId)
        : deleteQuery.is("destination_id", null);

      const { error: deleteError } = await deleteQuery;
      if (deleteError) {
        console.error("Failed to clear scoped product field value:", deleteError);
        return { ok: false, error: "Failed to clear scoped field value", unresolvedColumns };
      }
      continue;
    }

    const scopedPayload = buildFieldValueWritePayload({
      value: nextValue,
      fieldType: field.field_type,
      scope: params.scope,
    });

    const { error: insertError } = await supabase.from("product_field_values").insert({
      product_id: params.productId,
      product_field_id: field.id,
      ...scopedPayload,
    });
    if (insertError) {
      if (insertError.code === "23505") {
        const rawMessage = `${insertError.message || ""} ${insertError.details || ""}`.toLowerCase();
        if (rawMessage.includes("unique_product_field_locale_channel")) {
          return {
            ok: false,
            error:
              "Scoped save is blocked by legacy uniqueness on (product_id, product_field_id, locale, channel). Run migration 20260327_fix_product_field_values_scope_uniqueness.sql.",
            unresolvedColumns,
          };
        }

        // Retry as update for same scope tuple to handle concurrent save collisions.
        let retryQuery = supabase
          .from("product_field_values")
          .select("id")
          .eq("product_id", params.productId)
          .eq("product_field_id", field.id);
        retryQuery = params.scope.marketId
          ? retryQuery.eq("market_id", params.scope.marketId)
          : retryQuery.is("market_id", null);
        retryQuery = params.scope.channelId
          ? retryQuery.eq("channel_id", params.scope.channelId)
          : retryQuery.is("channel_id", null);
        retryQuery = params.scope.localeId
          ? retryQuery.eq("locale_id", params.scope.localeId)
          : retryQuery.is("locale_id", null);
        retryQuery = params.scope.destinationId
          ? retryQuery.eq("destination_id", params.scope.destinationId)
          : retryQuery.is("destination_id", null);

        const { data: retryExisting, error: retryLookupError } = await retryQuery
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!retryLookupError && retryExisting?.id) {
          const { error: retryUpdateError } = await supabase
            .from("product_field_values")
            .update({
              ...scopedPayload,
              updated_at: new Date().toISOString(),
            })
            .eq("id", retryExisting.id);
          if (!retryUpdateError) {
            continue;
          }
          console.error("Failed to update scoped product field value after duplicate insert:", retryUpdateError);
        }
      }
      console.error("Failed to insert scoped product field value:", insertError);
      return { ok: false, error: "Failed to create scoped field value", unresolvedColumns };
    }
  }

  return { ok: true, unresolvedColumns };
}

function isCrossTenantWrite(params: { tenant: string; selectedBrandSlug: string | null }): boolean {
  const selected = (params.selectedBrandSlug || '').trim().toLowerCase();
  if (!selected) return false;
  return selected !== params.tenant.trim().toLowerCase();
}

async function resolveChannelScopedProductIds(params: {
  organizationId: string;
  memberId: string;
}): Promise<string[] | null> {
  const scopedPermissions = await getScopedPermissionSummary({
    organizationId: params.organizationId,
    memberId: params.memberId,
    permissionKeys: PRODUCT_VIEW_PERMISSION_KEYS,
  });

  const hasAnyProductScope =
    scopedPermissions.hasOrganizationScope ||
    scopedPermissions.marketIds.length > 0 ||
    scopedPermissions.channelIds.length > 0;

  if (!hasAnyProductScope) {
    return [];
  }

  if (!scopedPermissions.hasOrganizationScope && scopedPermissions.channelIds.length > 0) {
    const scopedIds = new Set<string>();
    for (const channelId of scopedPermissions.channelIds) {
      const ids = await getChannelScopedProductIds({
        supabase: supabase,
        organizationId: params.organizationId,
        channelId,
      });
      for (const id of ids || []) {
        scopedIds.add(id);
      }
    }
    return Array.from(scopedIds);
  }

  return null;
}

async function getProductByIdentifier(params: {
  organizationId: string;
  productIdOrSku: string;
  selectClause: string;
}) {
  const normalizedIdentifier = (params.productIdOrSku || "").trim();
  const uuidPrefixMatch = normalizedIdentifier.match(UUID_PREFIX_PATTERN);
  const candidateId = uuidPrefixMatch?.[1] || normalizedIdentifier;

  if (UUID_PATTERN.test(candidateId)) {
    const byId = await supabase
      .from('products')
      .select(params.selectClause)
      .eq('id', candidateId)
      .eq('organization_id', params.organizationId)
      .maybeSingle();

    if (byId.data || byId.error) {
      return byId;
    }
  }

  return await supabase
    .from('products')
    .select(params.selectClause)
    .ilike('sku', normalizedIdentifier)
    .eq('organization_id', params.organizationId)
    .limit(1)
    .maybeSingle();
}

// GET /api/[tenant]/products/[productId] - Fetch single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const requestScope = parseScopeSelectionFromRequest(request);
    const selectedBrandSlug = new URL(request.url).searchParams.get('brand');

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const { context } = contextResult;
    const targetOrganizationId = context.targetOrganization.id;

    let constrainedProductIds: string[] | null = null;
    if (context.mode === 'partner_brand') {
      const grantedSetProducts = await resolvePartnerGrantedProductIds({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
      });

      if (grantedSetProducts.foundationAvailable) {
        constrainedProductIds = grantedSetProducts.productIds;
      } else {
        if (!context.brandMemberId) {
          constrainedProductIds = [];
        } else {
        constrainedProductIds = await resolveChannelScopedProductIds({
          organizationId: targetOrganizationId,
          memberId: context.brandMemberId,
        });
        }
      }
    }

    if (constrainedProductIds && constrainedProductIds.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    let productResult = await getProductByIdentifier({
      organizationId: targetOrganizationId,
      productIdOrSku: productId,
      selectClause: PRODUCT_SELECT_WITH_BARCODE,
    });

    if (productResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
      productResult = await getProductByIdentifier({
        organizationId: targetOrganizationId,
        productIdOrSku: productId,
        selectClause: PRODUCT_SELECT_WITH_UPC,
      });
    }

    const product = productResult.data
      ? withNormalizedBarcode(
          (productResult.data as unknown) as Record<string, unknown> & { id: string }
        )
      : null;
    const productError = productResult.error;

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (
      constrainedProductIds &&
      constrainedProductIds.length > 0 &&
      !constrainedProductIds.includes(product.id)
    ) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const resolvedProduct = await applyScopedProductValueOverrides({
      organizationId: targetOrganizationId,
      product,
      scope: requestScope,
    });
    const scopedCustomFieldValues = await loadScopedProductFieldValueMap({
      organizationId: targetOrganizationId,
      productId: resolvedProduct.id,
      scope: requestScope,
      includeSystemFields: false,
    });
    const hydratedProduct = {
      ...resolvedProduct,
      ...scopedCustomFieldValues,
    };

    let variants = null;
    if (hydratedProduct.type === 'parent' && hydratedProduct.has_variants) {
      const buildVariantQuery = (selectClause: string) => {
        let query = supabase
          .from('products')
          .select(selectClause)
          .eq('parent_id', hydratedProduct.id)
          .eq('organization_id', targetOrganizationId)
          .order('created_at', { ascending: true });

        if (constrainedProductIds && constrainedProductIds.length > 0) {
          query = query.in('id', constrainedProductIds);
        }

        return query;
      };

      let variantResult = await buildVariantQuery(PRODUCT_VARIANT_SELECT_WITH_BARCODE);
      if (variantResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
        variantResult = await buildVariantQuery(PRODUCT_VARIANT_SELECT_WITH_UPC);
      }
      if (!variantResult.error) {
        variants = (((variantResult.data || []) as unknown) as Record<string, unknown>[]).map((row) =>
          withNormalizedBarcode(row as Record<string, unknown> & { id: string })
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...hydratedProduct,
        variants,
      },
      organization: {
        id: context.targetOrganization.id,
        name: context.targetOrganization.name,
        slug: context.targetOrganization.slug,
      },
      view: {
        mode: context.mode,
        selectedBrandSlug: context.selectedBrandSlug,
        tenantSlug: context.tenantOrganization.slug,
      },
    });
  } catch (error) {
    console.error('Error in product GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/[tenant]/products/[productId] - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const requestScope = parseScopeSelectionFromRequest(request);
    const selectedBrandSlug = new URL(request.url).searchParams.get('brand');

    if (isCrossTenantWrite({ tenant, selectedBrandSlug })) {
      return NextResponse.json(
        { error: 'Cross-tenant writes are blocked in shared brand view.' },
        { status: 403 }
      );
    }

    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant, 'collaborate');
    if (!access.hasAccess) {
      return NextResponse.json(
        {
          error:
            'Access denied. You do not have permission to update products in this organization.',
        },
        { status: 403 }
      );
    }
    const organizationId = access.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization context is missing.' }, { status: 500 });
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const body = await request.json();
    const updateData = { ...body };

    const hasInitialScope = Object.prototype.hasOwnProperty.call(updateData, 'initialScope');
    const hasMarketplaceContent = Object.prototype.hasOwnProperty.call(updateData, 'marketplace_content');
    let normalizedMarketplaceContent: Record<string, unknown> | null = null;

    if (hasMarketplaceContent) {
      if (
        updateData.marketplace_content !== null &&
        (typeof updateData.marketplace_content !== 'object' ||
          Array.isArray(updateData.marketplace_content))
      ) {
        return NextResponse.json(
          { error: 'marketplace_content must be an object or null' },
          { status: 400 }
        );
      }
      normalizedMarketplaceContent =
        updateData.marketplace_content &&
        typeof updateData.marketplace_content === 'object' &&
        !Array.isArray(updateData.marketplace_content)
          ? { ...(updateData.marketplace_content as Record<string, unknown>) }
          : {};
    }

    if (hasMarketplaceContent && normalizedMarketplaceContent) {
      const hasMarketplaceAuthoringScope = Object.prototype.hasOwnProperty.call(
        normalizedMarketplaceContent,
        'authoringScope'
      );

      if (hasMarketplaceAuthoringScope) {
        const validatedMarketplaceScope = await validateAuthoringScope({
          supabase,
          organizationId,
          rawScope: (normalizedMarketplaceContent as Record<string, unknown>).authoringScope ?? null,
        });

        if (!validatedMarketplaceScope.ok) {
          return NextResponse.json(
            { error: validatedMarketplaceScope.error },
            { status: validatedMarketplaceScope.status }
          );
        }

        normalizedMarketplaceContent.authoringScope = validatedMarketplaceScope.scope;
      }
    }

    if (hasInitialScope) {
      const validatedInitialScope = await validateAuthoringScope({
        supabase,
        organizationId,
        rawScope: updateData.initialScope ?? null,
      });

      if (!validatedInitialScope.ok) {
        return NextResponse.json(
          { error: validatedInitialScope.error },
          { status: validatedInitialScope.status }
        );
      }

      normalizedMarketplaceContent = normalizedMarketplaceContent || {};
      normalizedMarketplaceContent.authoringScope = validatedInitialScope.scope;
    }

    if (normalizedMarketplaceContent) {
      updateData.marketplace_content = normalizedMarketplaceContent;
    }

    const { data: existingProduct, error: existingProductError } = await supabase
      .from('products')
      .select('id,type,status')
      .eq('id', productId)
      .eq('organization_id', access.organizationId)
      .maybeSingle();

    if (existingProductError) {
      return NextResponse.json({ error: 'Failed to load existing product' }, { status: 500 });
    }
    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // UI system field "title" maps to products.product_name.
    if (typeof updateData.title !== 'undefined' && typeof updateData.product_name === 'undefined') {
      updateData.product_name = updateData.title;
    }

    updateData.last_modified_by = user.id;

    if (typeof updateData.upc !== 'undefined' && typeof updateData.barcode === 'undefined') {
      updateData.barcode = updateData.upc;
    }

    const candidateScopedKeys = Object.keys(updateData).filter(
      (key) =>
        ![
          "id",
          "organization_id",
          "created_by",
          "created_at",
          "updated_at",
          "variant_count",
          "has_variants",
          "upc",
          "title",
          "scin",
          "initialScope",
          "last_modified_by",
        ].includes(key)
    );
    const hasScopedFieldPayload = candidateScopedKeys.some((key) => {
      const normalizedKey = key.toLowerCase();
      return (
        SCOPED_EDITABLE_COLUMNS.has(key) ||
        SCOPED_EDITABLE_COLUMNS.has(normalizedKey) ||
        !PRODUCT_ROW_MUTABLE_COLUMNS.has(key)
      );
    });

    const shouldUseScopedValueWrite =
      hasScopedIdSelection(requestScope) &&
      !hasMarketplaceContent &&
      !hasInitialScope &&
      hasScopedFieldPayload;

    if (shouldUseScopedValueWrite) {
      const scopedUpdateData: Record<string, unknown> = {};
      const rowScopedUpdateData: Record<string, unknown> = {};
      const ignoredColumns: string[] = [];

      Object.entries(updateData).forEach(([key, value]) => {
        if (key === "status" || key === "type") {
          rowScopedUpdateData[key] = value;
          return;
        }

        if (
          [
            "id",
            "organization_id",
            "created_by",
            "created_at",
            "updated_at",
            "variant_count",
            "has_variants",
            "upc",
            "title",
            "scin",
            "initialScope",
            "last_modified_by",
          ].includes(key)
        ) {
          ignoredColumns.push(key);
          return;
        }

        scopedUpdateData[key] = value;
      });

      if (
        Object.keys(scopedUpdateData).length === 0 &&
        Object.keys(rowScopedUpdateData).length === 0
      ) {
        return NextResponse.json(
          {
            error:
              ignoredColumns.length > 0
                ? `No scoped-editable fields provided. Ignored: ${ignoredColumns.join(", ")}`
                : "No scoped-editable fields provided.",
          },
          { status: 400 }
        );
      }

      let scopedPersistResult: {
        ok: boolean;
        error?: string;
        unresolvedColumns: string[];
      } = { ok: true, unresolvedColumns: [] };
      if (Object.keys(scopedUpdateData).length > 0) {
        scopedPersistResult = await persistScopedProductValueUpdates({
          organizationId,
          productId,
          scope: requestScope,
          updates: scopedUpdateData,
        });
      }

      if (!scopedPersistResult.ok) {
        const status =
          typeof scopedPersistResult.error === "string" &&
          scopedPersistResult.error.toLowerCase().includes("legacy uniqueness")
            ? 409
            : 500;
        return NextResponse.json(
          { error: scopedPersistResult.error || "Failed to persist scoped field values" },
          { status }
        );
      }

      if (Object.keys(rowScopedUpdateData).length > 0) {
        const nextType =
          typeof rowScopedUpdateData.type === "string"
            ? rowScopedUpdateData.type
            : existingProduct.type;
        const nextStatus =
          typeof rowScopedUpdateData.status === "string"
            ? rowScopedUpdateData.status
            : existingProduct.status;

        const becomesBillable =
          !isBillableSkuRecord({ type: existingProduct.type, status: existingProduct.status }) &&
          isBillableSkuRecord({ type: nextType, status: nextStatus });

        if (becomesBillable) {
          const skuCapacity = await assertBillingCapacity({
            organizationId,
            meter: "activeSkuCount",
          });
          if (!skuCapacity.allowed) {
            return NextResponse.json(
              {
                error: skuCapacity.message,
                code: "ACTIVE_SKU_LIMIT_REACHED",
                limit: skuCapacity.limit,
                usage: skuCapacity.usage,
              },
              { status: 403 }
            );
          }
        }

        const { error: rowScopedUpdateError } = await supabase
          .from("products")
          .update({
            ...rowScopedUpdateData,
            last_modified_by: user.id,
          })
          .eq("id", productId)
          .eq("organization_id", organizationId);

        if (rowScopedUpdateError) {
          console.error("Failed to update row-level scoped fallback columns:", {
            productId,
            organizationId,
            code: rowScopedUpdateError.code,
            message: rowScopedUpdateError.message,
            details: rowScopedUpdateError.details,
            hint: rowScopedUpdateError.hint,
          });
          return NextResponse.json(
            {
              error: "Failed to update product",
              details: rowScopedUpdateError.message || null,
              code: rowScopedUpdateError.code || null,
            },
            { status: 500 }
          );
        }
      }

      let scopedProductResult = await getProductByIdentifier({
        organizationId,
        productIdOrSku: productId,
        selectClause: PRODUCT_RETURN_SELECT_WITH_BARCODE,
      });

      if (scopedProductResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
        scopedProductResult = await getProductByIdentifier({
          organizationId,
          productIdOrSku: productId,
          selectClause: PRODUCT_RETURN_SELECT_WITH_UPC,
        });
      }

      const scopedProduct = scopedProductResult.data
        ? withNormalizedBarcode(
            (scopedProductResult.data as unknown) as Record<string, unknown> & { id: string }
          )
        : null;

      if (!scopedProduct) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }

      const scopedViewProduct = await applyScopedProductValueOverrides({
        organizationId,
        product: scopedProduct,
        scope: requestScope,
      });
      const scopedCustomFieldValues = await loadScopedProductFieldValueMap({
        organizationId,
        productId: scopedProduct.id,
        scope: requestScope,
        includeSystemFields: false,
      });
      const scopedHydratedProduct = {
        ...scopedViewProduct,
        ...scopedCustomFieldValues,
      };

      return NextResponse.json({
        success: true,
        data: scopedHydratedProduct,
        warnings:
          scopedPersistResult.unresolvedColumns.length > 0
            ? {
                unresolvedColumns: scopedPersistResult.unresolvedColumns,
              }
            : undefined,
      });
    }

    const nextType = typeof updateData.type === 'string' ? updateData.type : existingProduct.type;
    const nextStatus =
      typeof updateData.status === 'string' ? updateData.status : existingProduct.status;

    const becomesBillable =
      !isBillableSkuRecord({ type: existingProduct.type, status: existingProduct.status }) &&
      isBillableSkuRecord({ type: nextType, status: nextStatus });

    if (becomesBillable) {
      const skuCapacity = await assertBillingCapacity({
        organizationId,
        meter: 'activeSkuCount',
      });
      if (!skuCapacity.allowed) {
        return NextResponse.json(
          {
            error: skuCapacity.message,
            code: 'ACTIVE_SKU_LIMIT_REACHED',
            limit: skuCapacity.limit,
            usage: skuCapacity.usage,
          },
          { status: 403 }
        );
      }
    }

    delete updateData.id;
    delete updateData.organization_id;
    delete updateData.created_by;
    delete updateData.created_at;
    delete updateData.updated_at;
    delete updateData.variant_count;
    delete updateData.has_variants;
    delete updateData.upc;
    delete updateData.title;
    delete updateData.scin;
    delete updateData.initialScope;

    const rowUpdateData: Record<string, unknown> = {};
    const globalValueUpdates: Record<string, unknown> = {};
    Object.entries(updateData).forEach(([key, value]) => {
      if (PRODUCT_ROW_MUTABLE_COLUMNS.has(key)) {
        rowUpdateData[key] = value;
      } else {
        globalValueUpdates[key] = value;
      }
    });

    let globalValuePersistResult:
      | { ok: boolean; error?: string; unresolvedColumns: string[] }
      | null = null;
    if (Object.keys(globalValueUpdates).length > 0) {
      globalValuePersistResult = await persistScopedProductValueUpdates({
        organizationId,
        productId,
        scope: {
          marketId: null,
          channelId: null,
          localeId: null,
          destinationId: null,
          channelCode: null,
          localeCode: null,
          destinationCode: null,
        },
        updates: globalValueUpdates,
      });

      if (!globalValuePersistResult.ok) {
        const status =
          typeof globalValuePersistResult.error === "string" &&
          globalValuePersistResult.error.toLowerCase().includes("legacy uniqueness")
            ? 409
            : 500;
        return NextResponse.json(
          { error: globalValuePersistResult.error || "Failed to persist product field values" },
          { status }
        );
      }
    }

    let product: (Record<string, unknown> & { id: string; barcode: string | null }) | null = null;
    if (Object.keys(rowUpdateData).length > 0) {
      let updateResult = await supabase
        .from('products')
        .update(rowUpdateData)
        .eq('id', productId)
        .eq('organization_id', organizationId)
        .select(PRODUCT_RETURN_SELECT_WITH_BARCODE)
        .single();

      // Backward compatibility for older schemas still using upc.
      if (updateResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
        const legacyUpdateData = {
          ...rowUpdateData,
          upc: rowUpdateData.barcode,
        } as Record<string, unknown>;
        delete legacyUpdateData.barcode;

        updateResult = await supabase
          .from('products')
          .update(legacyUpdateData)
          .eq('id', productId)
          .eq('organization_id', organizationId)
          .select(PRODUCT_RETURN_SELECT_WITH_UPC)
          .single();
      }

      const productError = updateResult.error;
      if (productError) {
        if (productError.code === '23505') {
          return NextResponse.json(
            { error: 'A product with this SKU already exists' },
            { status: 409 }
          );
        }

        console.error('Failed to update product row:', {
          productId,
          organizationId,
          code: productError.code,
          message: productError.message,
          details: productError.details,
          hint: productError.hint,
        });
        return NextResponse.json(
          {
            error: 'Failed to update product',
            details: productError.message || null,
            code: productError.code || null,
          },
          { status: 500 }
        );
      }

      product = updateResult.data
        ? withNormalizedBarcode(
            (updateResult.data as unknown) as Record<string, unknown> & { id: string }
          )
        : null;
    } else {
      let productResult = await getProductByIdentifier({
        organizationId,
        productIdOrSku: productId,
        selectClause: PRODUCT_RETURN_SELECT_WITH_BARCODE,
      });

      if (productResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
        productResult = await getProductByIdentifier({
          organizationId,
          productIdOrSku: productId,
          selectClause: PRODUCT_RETURN_SELECT_WITH_UPC,
        });
      }

      product = productResult.data
        ? withNormalizedBarcode(
            (productResult.data as unknown) as Record<string, unknown> & { id: string }
          )
        : null;
    }

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const hydratedCustomValues = await loadScopedProductFieldValueMap({
      organizationId,
      productId: product.id,
      scope: requestScope,
      includeSystemFields: false,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...product,
        ...hydratedCustomValues,
      },
      warnings:
        globalValuePersistResult && globalValuePersistResult.unresolvedColumns.length > 0
          ? {
              unresolvedColumns: globalValuePersistResult.unresolvedColumns,
            }
          : undefined,
    });
  } catch (error) {
    console.error('Error in product PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/[tenant]/products/[productId] - Partial update product
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  return await PUT(request, { params });
}

// DELETE /api/[tenant]/products/[productId] - Delete product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get('brand');

    if (isCrossTenantWrite({ tenant, selectedBrandSlug })) {
      return NextResponse.json(
        { error: 'Cross-tenant writes are blocked in shared brand view.' },
        { status: 403 }
      );
    }

    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant, 'admin');
    if (!access.hasAccess) {
      return NextResponse.json(
        {
          error:
            'Access denied. You do not have permission to delete products in this organization.',
        },
        { status: 403 }
      );
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const { data: product, error: checkError } = await supabase
      .from('products')
      .select('id, type, has_variants, variant_count, sku')
      .eq('id', productId)
      .eq('organization_id', access.organizationId)
      .single();

    if (checkError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.type === 'parent') {
      // Use live child count instead of cached has_variants/variant_count so
      // parent deletes work immediately after variant deletes in the same workflow.
      const { count: childCount, error: childCountError } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', access.organizationId)
        .eq('parent_id', productId);

      if (childCountError) {
        console.error('Failed to resolve parent child count before delete:', {
          productId,
          organizationId: access.organizationId,
          code: childCountError.code,
          message: childCountError.message,
          details: childCountError.details,
          hint: childCountError.hint,
        });
        return NextResponse.json({ error: 'Failed to validate parent variants' }, { status: 500 });
      }

      if ((childCount || 0) > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete parent product with variants. Delete variants first (${childCount}).`,
          },
          { status: 400 }
        );
      }
    }

    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('organization_id', access.organizationId);

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    console.error('Error in product DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
