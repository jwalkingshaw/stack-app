import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { requireLocalizationAccess } from "../_shared";

type ProductRow = {
  id: string;
  type: string | null;
  parent_id: string | null;
  product_name: string | null;
  short_description: string | null;
  long_description: string | null;
  features: unknown;
};

type ProductFieldRow = {
  id: string;
  code: string;
  name: string;
  field_type: string | null;
  is_localizable: boolean | null;
  is_translatable: boolean | null;
  is_active: boolean | null;
  sort_order: number | null;
};

type ProductFieldValueRow = {
  product_id: string;
  product_field_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_datetime: string | null;
  value_json: unknown;
  market_id: string | null;
  channel_id: string | null;
  destination_id: string | null;
  locale_id: string | null;
};

type AvailableFieldsPayload = {
  systemFields: Array<{ code: string; label: string }>;
  customFields: Array<{ id: string; code: string; name: string }>;
};

const AVAILABLE_FIELDS_CACHE_TTL_MS = 5_000;
const availableFieldsCache = new Map<string, { expiresAt: number; value: AvailableFieldsPayload }>();
const availableFieldsInFlight = new Map<string, Promise<AvailableFieldsPayload>>();

const AVAILABLE_SYSTEM_FIELDS = [
  { code: "product_name", label: "Product Name" },
  { code: "short_description", label: "Short Description" },
  { code: "long_description", label: "Long Description" },
  { code: "features", label: "Features / Bullets" },
] as const;

const TEXTUAL_PRODUCT_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "rich_text",
  "wysiwyg",
  "markdown",
  "long_text",
  "identifier",
  "url",
  "select",
  "multiselect",
  "multi_select",
]);

const SYSTEM_FIELD_CODES = AVAILABLE_SYSTEM_FIELDS.map((field) => field.code);

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }
  return Array.from(unique);
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeUuidArray(value: unknown): string[] {
  return normalizeStringArray(value).filter(isUuidLike);
}

function getAvailableFieldsCacheKey(params: {
  organizationId: string;
  productIds: string[];
  sourceLocaleId: string | null;
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
}): string {
  return [
    params.organizationId,
    [...params.productIds].sort().join(","),
    params.sourceLocaleId ?? "",
    params.sourceMarketId ?? "",
    params.sourceChannelId ?? "",
    params.sourceDestinationId ?? "",
  ].join("::");
}

function getCachedAvailableFields(cacheKey: string): AvailableFieldsPayload | null {
  const cached = availableFieldsCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    availableFieldsCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedAvailableFields(cacheKey: string, value: AvailableFieldsPayload) {
  availableFieldsCache.set(cacheKey, {
    expiresAt: Date.now() + AVAILABLE_FIELDS_CACHE_TTL_MS,
    value,
  });
}

function toTextValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const values = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    if (values.length === 0) return null;
    return values.join("\n");
  }

  if (value && typeof value === "object") {
    const objectValues = Object.values(value as Record<string, unknown>)
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    if (objectValues.length === 0) return null;
    return objectValues.join("\n");
  }

  return null;
}

function extractFieldValue(product: ProductRow, fieldCode: string): string | null {
  switch (fieldCode) {
    case "product_name":
      return toTextValue(product.product_name);
    case "short_description":
      return toTextValue(product.short_description);
    case "long_description":
      return toTextValue(product.long_description);
    case "features":
      return toTextValue(product.features);
    default:
      return null;
  }
}

async function resolveProducts(organizationId: string, productIds: string[]): Promise<ProductRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("products")
    .select("id,type,parent_id,product_name,short_description,long_description,features")
    .eq("organization_id", organizationId)
    .in("id", productIds);

  if (error) {
    throw new Error("Failed to load products");
  }

  return (data || []) as ProductRow[];
}

async function resolveParentProductsForVariants(
  organizationId: string,
  products: ProductRow[]
): Promise<Map<string, ProductRow>> {
  const parentIds = Array.from(
    new Set(
      products
        .filter(
          (product) =>
            product.type === "variant" &&
            typeof product.parent_id === "string" &&
            product.parent_id.trim().length > 0
        )
        .map((product) => String(product.parent_id).trim())
    )
  );

  if (parentIds.length === 0) {
    return new Map<string, ProductRow>();
  }

  const { data, error } = await getSupabaseServer()
    .from("products")
    .select("id,type,parent_id,product_name,short_description,long_description,features")
    .eq("organization_id", organizationId)
    .in("id", parentIds);

  if (error) {
    throw new Error("Failed to load parent products for variant inheritance");
  }

  const map = new Map<string, ProductRow>();
  for (const row of (data || []) as ProductRow[]) {
    map.set(row.id, row);
  }
  return map;
}

async function resolveTranslatableProductFields(
  organizationId: string
): Promise<ProductFieldRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("product_fields")
    .select("id,code,name,field_type,is_localizable,is_translatable,is_active,sort_order")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error("Failed to load translatable product fields");
  }

  return ((data || []) as ProductFieldRow[]).filter((row) => {
    const fieldType = String(row.field_type || "").trim().toLowerCase();
    return (
      Boolean(row.id && row.code && row.name) &&
      TEXTUAL_PRODUCT_FIELD_TYPES.has(fieldType) &&
      Boolean(row.is_localizable)
    );
  });
}

async function resolveSystemFieldDefinitions(
  organizationId: string
): Promise<Array<Pick<ProductFieldRow, "id" | "code">>> {
  const { data, error } = await getSupabaseServer()
    .from("product_fields")
    .select("id,code")
    .eq("organization_id", organizationId)
    .in("code", SYSTEM_FIELD_CODES)
    .eq("is_active", true);

  if (error) {
    throw new Error("Failed to load system product fields");
  }

  return ((data || []) as Array<Pick<ProductFieldRow, "id" | "code">>).filter(
    (row) => Boolean(row.id && row.code)
  );
}

async function resolveProductFieldValues(params: {
  organizationId: string;
  productIds: string[];
  productFieldIds: string[];
}): Promise<ProductFieldValueRow[]> {
  if (params.productIds.length === 0 || params.productFieldIds.length === 0) {
    return [];
  }

  const { data, error } = await getSupabaseServer()
    .from("product_field_values")
    .select(
      "product_id,product_field_id,value_text,value_number,value_boolean,value_date,value_datetime,value_json,market_id,channel_id,destination_id,locale_id"
    )
    .in("product_id", params.productIds)
    .in("product_field_id", params.productFieldIds);

  if (error) {
    console.error("Failed to load product field values for localization available-fields:", error);
    throw new Error("Failed to load product field values");
  }

  return (data || []) as ProductFieldValueRow[];
}

function scoreScopeMatch(params: {
  row: ProductFieldValueRow;
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  sourceLocaleId: string | null;
}): number {
  const { row, sourceMarketId, sourceChannelId, sourceDestinationId, sourceLocaleId } = params;

  const dimensionScore = (actual: string | null, desired: string | null, weight: number): number => {
    if (desired) {
      if (actual === desired) return weight;
      if (actual === null) return 1;
      return -1000;
    }
    if (actual === null) return 2;
    return -1000;
  };

  return (
    dimensionScore(row.market_id, sourceMarketId, 32) +
    dimensionScore(row.channel_id, sourceChannelId, 24) +
    dimensionScore(row.destination_id, sourceDestinationId, 16) +
    dimensionScore(row.locale_id, sourceLocaleId, 24)
  );
}

function pickBestSourceValue(params: {
  rows: ProductFieldValueRow[];
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  sourceLocaleId: string | null;
}): string | null {
  if (!params.rows.length) return null;

  const candidates = params.rows
    .map((row) => ({
      row,
      score: scoreScopeMatch({
        row,
        sourceMarketId: params.sourceMarketId,
        sourceChannelId: params.sourceChannelId,
        sourceDestinationId: params.sourceDestinationId,
        sourceLocaleId: params.sourceLocaleId,
      }),
    }))
    .filter((entry) => entry.score > -500)
    .sort((a, b) => b.score - a.score);

  for (const entry of candidates) {
    const value =
      entry.row.value_text ??
      entry.row.value_number ??
      entry.row.value_boolean ??
      entry.row.value_date ??
      entry.row.value_datetime ??
      entry.row.value_json;
    const asText = toTextValue(value);
    if (asText) return asText;
  }

  return null;
}

function buildProductFieldSourceTextMap(params: {
  rows: ProductFieldValueRow[];
  productIds: string[];
  productFieldIds: string[];
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  sourceLocaleId: string | null;
}): Map<string, string> {
  const rowsByKey = new Map<string, ProductFieldValueRow[]>();
  for (const row of params.rows) {
    const key = `${row.product_id}::${row.product_field_id}`;
    const existing = rowsByKey.get(key);
    if (existing) {
      existing.push(row);
    } else {
      rowsByKey.set(key, [row]);
    }
  }

  const map = new Map<string, string>();
  for (const productId of params.productIds) {
    for (const productFieldId of params.productFieldIds) {
      const key = `${productId}::${productFieldId}`;
      const rows = rowsByKey.get(key) || [];
      const sourceText = pickBestSourceValue({
        rows,
        sourceMarketId: params.sourceMarketId,
        sourceChannelId: params.sourceChannelId,
        sourceDestinationId: params.sourceDestinationId,
        sourceLocaleId: params.sourceLocaleId,
      });
      if (sourceText) {
        map.set(key, sourceText);
      }
    }
  }

  return map;
}

function buildSourceTextMapByFieldCode(params: {
  rows: ProductFieldValueRow[];
  productIds: string[];
  fieldDefinitions: Array<{ id: string; code: string }>;
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
  sourceLocaleId: string | null;
}): Map<string, string> {
  const textByProductAndFieldId = buildProductFieldSourceTextMap({
    rows: params.rows,
    productIds: params.productIds,
    productFieldIds: params.fieldDefinitions.map((field) => field.id),
    sourceMarketId: params.sourceMarketId,
    sourceChannelId: params.sourceChannelId,
    sourceDestinationId: params.sourceDestinationId,
    sourceLocaleId: params.sourceLocaleId,
  });

  const fieldCodeById = new Map(params.fieldDefinitions.map((field) => [field.id, field.code]));
  const textByProductAndCode = new Map<string, string>();
  for (const [key, value] of textByProductAndFieldId.entries()) {
    const [productId, fieldId] = key.split("::");
    const fieldCode = fieldCodeById.get(fieldId);
    if (!fieldCode) continue;
    textByProductAndCode.set(`${productId}::${fieldCode}`, value);
  }

  return textByProductAndCode;
}

async function computeAvailableFields(params: {
  organizationId: string;
  productIds: string[];
  sourceLocaleId: string | null;
  sourceMarketId: string | null;
  sourceChannelId: string | null;
  sourceDestinationId: string | null;
}): Promise<AvailableFieldsPayload> {
  const [products, customFields] = await Promise.all([
    resolveProducts(params.organizationId, params.productIds),
    resolveTranslatableProductFields(params.organizationId),
  ]);
  const parentProductsById = await resolveParentProductsForVariants(params.organizationId, products);
  const relevantProductIds = Array.from(
    new Set([
      ...products.map((product) => product.id),
      ...Array.from(parentProductsById.keys()),
    ])
  );
  const systemFieldDefinitions = await resolveSystemFieldDefinitions(params.organizationId);

  let scopedSystemFieldSourceTexts = new Map<string, string>();
  if (systemFieldDefinitions.length > 0) {
    const systemValueRows = await resolveProductFieldValues({
      organizationId: params.organizationId,
      productIds: relevantProductIds,
      productFieldIds: systemFieldDefinitions.map((field) => field.id),
    });
    scopedSystemFieldSourceTexts = buildSourceTextMapByFieldCode({
      rows: systemValueRows,
      productIds: relevantProductIds,
      fieldDefinitions: systemFieldDefinitions,
      sourceMarketId: params.sourceMarketId,
      sourceChannelId: params.sourceChannelId,
      sourceDestinationId: params.sourceDestinationId,
      sourceLocaleId: params.sourceLocaleId,
    });
  }

  const availableSystemFields = AVAILABLE_SYSTEM_FIELDS.filter((field) => {
    return products.some((product) => {
      const ownScopedKey = `${product.id}::${field.code}`;
      let sourceText =
        scopedSystemFieldSourceTexts.get(ownScopedKey) ??
        extractFieldValue(product, field.code);
      if (!sourceText && product.type === "variant" && product.parent_id) {
        const parentScopedKey = `${product.parent_id}::${field.code}`;
        sourceText =
          scopedSystemFieldSourceTexts.get(parentScopedKey) ??
          extractFieldValue(parentProductsById.get(product.parent_id) ?? product, field.code);
      }
      return Boolean(sourceText);
    });
  });

  let availableCustomFields: Array<{ id: string; code: string; name: string }> = [];
  if (customFields.length > 0) {
    const customFieldIds = customFields.map((field) => field.id);

    const customValueRows = await resolveProductFieldValues({
      organizationId: params.organizationId,
      productIds: relevantProductIds,
      productFieldIds: customFieldIds,
    });

    const customSourceTextByProductAndField = buildProductFieldSourceTextMap({
      rows: customValueRows,
      productIds: relevantProductIds,
      productFieldIds: customFieldIds,
      sourceMarketId: params.sourceMarketId,
      sourceChannelId: params.sourceChannelId,
      sourceDestinationId: params.sourceDestinationId,
      sourceLocaleId: params.sourceLocaleId,
    });

    availableCustomFields = customFields
      .filter((field) =>
        products.some((product) => {
          const ownKey = `${product.id}::${field.id}`;
          if (customSourceTextByProductAndField.has(ownKey)) return true;
          if (product.type === "variant" && product.parent_id) {
            const parentKey = `${product.parent_id}::${field.id}`;
            return customSourceTextByProductAndField.has(parentKey);
          }
          return false;
        })
      )
      .map((field) => ({
        id: field.id,
        code: field.code,
        name: field.name,
      }));
  }

  return {
    systemFields: availableSystemFields,
    customFields: availableCustomFields,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const resolved = await params;
    const access = await requireLocalizationAccess(request, resolved.tenant);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const productIds = normalizeUuidArray(body?.productIds ?? body?.product_ids);
    const sourceLocaleId = normalizeOptionalString(body?.sourceLocaleId ?? body?.source_locale_id);
    const sourceMarketId = normalizeOptionalString(body?.sourceMarketId ?? body?.source_market_id);
    const sourceChannelId = normalizeOptionalString(body?.sourceChannelId ?? body?.source_channel_id);
    const sourceDestinationId = normalizeOptionalString(
      body?.sourceDestinationId ?? body?.source_destination_id
    );

    if (productIds.length === 0) {
      return NextResponse.json({ error: "productIds must include at least one product." }, { status: 400 });
    }

    const { organization } = access.context;
    const cacheKey = getAvailableFieldsCacheKey({
      organizationId: organization.id,
      productIds,
      sourceLocaleId,
      sourceMarketId,
      sourceChannelId,
      sourceDestinationId,
    });
    const cachedPayload = getCachedAvailableFields(cacheKey);
    if (cachedPayload) {
      return NextResponse.json({
        success: true,
        data: cachedPayload,
      });
    }

    const existingPromise = availableFieldsInFlight.get(cacheKey);
    const payloadPromise =
      existingPromise ??
      computeAvailableFields({
        organizationId: organization.id,
        productIds,
        sourceLocaleId,
        sourceMarketId,
        sourceChannelId,
        sourceDestinationId,
      });

    if (!existingPromise) {
      availableFieldsInFlight.set(cacheKey, payloadPromise);
    }

    let payload: AvailableFieldsPayload;
    try {
      payload = await payloadPromise;
    } finally {
      if (!existingPromise) {
        availableFieldsInFlight.delete(cacheKey);
      }
    }

    if (!existingPromise) {
      setCachedAvailableFields(cacheKey, payload);
    }

    return NextResponse.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error("Error in localization available-fields POST:", error);
    return NextResponse.json({ error: "Failed to load available translation fields" }, { status: 500 });
  }
}
