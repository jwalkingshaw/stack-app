import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess, setDatabaseUserContext } from "@/lib/user-context";
import {
  PRODUCT_VIEW_PERMISSION_KEYS,
  getScopedPermissionSummary,
  resolvePartnerGrantedProductIds,
  resolvePartnerEffectiveOutputProfileId,
  resolvePartnerSharedBrandOrganizationIds,
  resolveTenantBrandViewContext,
} from "@/lib/partner-brand-view";
import { getChannelScopedProductIds } from "@/lib/product-channel-scope";
import { assertBillingCapacity, isBillableSkuRecord } from "@/lib/billing-policy";
import { validateAuthoringScope } from "@/lib/authoring-scope";
import {
  addResourceToGlobalCatalogSet,
  resolveMarketCatalogProductIds,
} from "@/lib/market-catalog";
import { cache as redisCache, CacheKeys } from "@/lib/redis";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRODUCT_SELECT_WITH_BARCODE = `
  id,
  organization_id,
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

const PRODUCT_SELECT_WITH_UPC = PRODUCT_SELECT_WITH_BARCODE.replace("barcode", "upc");

const PRODUCT_TABLE_SELECT_WITH_BARCODE = `
  id,
  organization_id,
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
  status,
  assets_count,
  content_score,
  marketplace_content,
  created_by,
  created_at,
  updated_at,
  last_modified_by,
  product_families!family_id (
    name
  )
`;

const PRODUCT_TABLE_SELECT_WITH_UPC =
  PRODUCT_TABLE_SELECT_WITH_BARCODE.replace("barcode", "upc");

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
  product_families!family_id (
    name
  )
`;

const PRODUCT_RETURN_SELECT_WITH_UPC =
  PRODUCT_RETURN_SELECT_WITH_BARCODE.replace("barcode", "upc");
const LIST_CACHE_TTL_SECONDS = 60;

const UPC_MISSING_COLUMN_ERROR = "42703";
type ProductListMode = "full" | "table";

type ListPagination = {
  limit: number;
  offset: number;
  enabled: boolean;
};

type ProductAuthoringScope = {
  mode: "global" | "scoped";
  marketIds: string[];
  channelIds: string[];
  localeIds: string[];
  destinationIds: string[];
};

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
  locale_id: string | null;
  destination_id: string | null;
  channel: string | null;
  locale: string | null;
};

type ProductListRow = Record<string, unknown> & {
  id?: string;
  organization_id?: string;
  created_at?: string;
  barcode?: string | null;
  upc?: string | null;
  marketplace_content?: Record<string, unknown> | null;
  marketplaceContent?: Record<string, unknown> | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

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

const SCOPED_PRODUCT_LIST_COLUMNS = new Set(Object.keys(SCOPED_FIELD_CODE_CANDIDATES));
const TABLE_SCOPED_PRODUCT_LIST_COLUMNS = new Set(["product_name", "sku", "barcode", "brand_line"]);
const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 1000;

function normalizeBarcodeInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringIdArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const deduped = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const cleaned = value.trim();
    if (!cleaned) continue;
    deduped.add(cleaned);
  }
  return Array.from(deduped);
}

function normalizeProductAuthoringScope(raw: unknown): ProductAuthoringScope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const mode = value.mode === "scoped" ? "scoped" : value.mode === "global" ? "global" : null;
  if (!mode) return null;

  const normalized: ProductAuthoringScope = {
    mode,
    marketIds: normalizeStringIdArray(value.marketIds),
    channelIds: normalizeStringIdArray(value.channelIds),
    localeIds: normalizeStringIdArray(value.localeIds),
    destinationIds: normalizeStringIdArray(value.destinationIds),
  };

  if (normalized.mode === "global") {
    return {
      mode: "global",
      marketIds: [],
      channelIds: [],
      localeIds: [],
      destinationIds: [],
    };
  }

  return normalized;
}

function getProductAuthoringScopeFromRow(row: ProductListRow): ProductAuthoringScope | null {
  const legacyContent = asRecord(row.marketplace_content);
  const modernContent = asRecord(row.marketplaceContent);
  const rawScope = legacyContent?.authoringScope ?? modernContent?.authoringScope ?? null;
  return normalizeProductAuthoringScope(rawScope);
}

function isProductVisibleForMarketScope(params: {
  product: ProductListRow;
  scope: ScopeSelection;
}): boolean {
  const selectedMarketId = params.scope.marketId;
  if (!selectedMarketId) return true;

  const authoringScope = getProductAuthoringScopeFromRow(params.product);
  if (!authoringScope || authoringScope.mode !== "scoped") {
    return true;
  }
  if (authoringScope.marketIds.length === 0) {
    // Scoped with no explicit market constraint behaves like "all markets".
    return true;
  }
  return authoringScope.marketIds.includes(selectedMarketId);
}

function applyMarketVisibilityFilter(params: {
  products: ProductListRow[];
  scope: ScopeSelection;
}): ProductListRow[] {
  if (!params.scope.marketId) return params.products;
  return params.products.filter((product) =>
    isProductVisibleForMarketScope({ product, scope: params.scope })
  );
}

function intersectIds(left: string[] | null, right: string[] | null): string[] | null {
  if (!left && !right) return null;
  if (!left) return Array.from(new Set(right || []));
  if (!right) return Array.from(new Set(left));
  const rightSet = new Set(right);
  return Array.from(new Set(left.filter((id) => rightSet.has(id))));
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

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseListPagination(searchParams: URLSearchParams): ListPagination {
  const rawLimit = parsePositiveInt(searchParams.get("limit"));
  const rawOffset = parsePositiveInt(searchParams.get("offset"));
  const rawPage = parsePositiveInt(searchParams.get("page"));

  const enabled = rawLimit !== null || rawOffset !== null || rawPage !== null;
  if (!enabled) {
    return {
      limit: 0,
      offset: 0,
      enabled: false,
    };
  }

  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, rawLimit ?? DEFAULT_LIST_LIMIT));
  const pageOffset = rawPage ? Math.max(0, (rawPage - 1) * limit) : 0;
  const offset = Math.max(0, (rawOffset ?? pageOffset) || 0);

  return {
    limit,
    offset,
    enabled: true,
  };
}

function normalizeSearchQuery(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function readRowString(row: ProductListRow, key: string): string {
  const raw = row[key];
  return typeof raw === "string" ? raw : "";
}

function scoreSearchToken(value: string, query: string): number {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 0;
  if (normalized === query) return 120;
  if (normalized.startsWith(query)) return 80;
  const containsIndex = normalized.indexOf(query);
  if (containsIndex >= 0) {
    return Math.max(20, 60 - containsIndex);
  }
  return 0;
}

function scoreProductSearchMatch(product: ProductListRow, query: string): number {
  const productName = readRowString(product, "product_name");
  const sku = readRowString(product, "sku");
  const scin = readRowString(product, "scin");
  const barcode = readRowString(product, "barcode") || readRowString(product, "upc");
  const brandLine = readRowString(product, "brand_line");

  let score = 0;
  score = Math.max(score, scoreSearchToken(productName, query) + 30);
  score = Math.max(score, scoreSearchToken(sku, query) + 20);
  score = Math.max(score, scoreSearchToken(scin, query) + 15);
  score = Math.max(score, scoreSearchToken(barcode, query) + 10);
  score = Math.max(score, scoreSearchToken(brandLine, query));
  return score;
}

function filterProductsBySearch(
  products: ProductListRow[],
  query: string | null
): ProductListRow[] {
  if (!query) return products;

  const ranked = products
    .map((product) => ({
      product,
      score: scoreProductSearchMatch(product, query),
      updatedAt: new Date(String(product.updated_at || product.created_at || 0)).getTime(),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);

  return ranked.map((row) => row.product);
}

function paginateRows<T>(rows: T[], pagination: ListPagination) {
  if (!pagination.enabled) {
    return {
      rows,
      meta: {
        enabled: false,
        total: rows.length,
      },
    };
  }

  const start = Math.min(rows.length, pagination.offset);
  const end = Math.min(rows.length, start + pagination.limit);
  const pagedRows = rows.slice(start, end);

  return {
    rows: pagedRows,
    meta: {
      enabled: true,
      limit: pagination.limit,
      offset: pagination.offset,
      total: rows.length,
      hasMore: end < rows.length,
    },
  };
}

function parseScopeSelectionFromSearchParams(searchParams: URLSearchParams): ScopeSelection {
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

async function resolveScopedFieldMap(params: {
  organizationId: string;
  columns: string[];
}): Promise<Map<string, ProductFieldRow>> {
  const uniqueColumns = Array.from(
    new Set(
      params.columns
        .map((column) => String(column || "").trim().toLowerCase())
        .filter((column) => column.length > 0)
    )
  );
  if (uniqueColumns.length === 0) return new Map();

  const candidateCodes = Array.from(
    new Set(
      uniqueColumns
        .flatMap((column) => SCOPED_FIELD_CODE_CANDIDATES[column] || [column])
        .map((code) => code.toLowerCase())
    )
  );
  if (candidateCodes.length === 0) return new Map();

  const { data, error } = await supabase
    .from("product_fields")
    .select("id,code")
    .eq("organization_id", params.organizationId)
    .in("code", candidateCodes);

  if (error) {
    console.error("Failed to resolve scoped product fields for list:", error);
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
    const candidates = SCOPED_FIELD_CODE_CANDIDATES[column] || [column];
    for (const code of candidates) {
      const row = byCode.get(code.toLowerCase());
      if (row) {
        mapped.set(column, row);
        break;
      }
    }
  });

  return mapped;
}

async function applyScopedOverridesForOrganization(params: {
  organizationId: string;
  products: ProductListRow[];
  scope: ScopeSelection;
  columns?: string[];
}): Promise<ProductListRow[]> {
  if (!hasScopedSelection(params.scope)) return params.products;
  if (params.products.length === 0) return params.products;

  const scopedColumns =
    params.columns && params.columns.length > 0
      ? params.columns
      : Array.from(SCOPED_PRODUCT_LIST_COLUMNS);
  const fieldMap = await resolveScopedFieldMap({
    organizationId: params.organizationId,
    columns: scopedColumns,
  });
  if (fieldMap.size === 0) return params.products;

  const productIds = Array.from(
    new Set(params.products.map((product) => String(product.id || "").trim()).filter(Boolean))
  );
  if (productIds.length === 0) return params.products;

  const fieldIds = Array.from(new Set(Array.from(fieldMap.values()).map((row) => row.id)));
  if (fieldIds.length === 0) return params.products;

  const { data, error } = await supabase
    .from("product_field_values")
    .select(
      "product_id,product_field_id,value_text,value_number,value_boolean,value_date,value_datetime,value_json,market_id,channel_id,locale_id,destination_id,channel,locale"
    )
    .in("product_id", productIds)
    .in("product_field_id", fieldIds);

  if (error) {
    console.error("Failed to load scoped product field values for list:", error);
    return params.products;
  }

  const scopedRowsByProductField = new Map<string, ProductFieldValueRow[]>();
  ((data || []) as ProductFieldValueRow[]).forEach((row) => {
    const productId = String(row.product_id || "").trim();
    const fieldId = String(row.product_field_id || "").trim();
    if (!productId || !fieldId) return;
    const key = `${productId}::${fieldId}`;
    const rows = scopedRowsByProductField.get(key) || [];
    rows.push(row);
    scopedRowsByProductField.set(key, rows);
  });

  const productOverrides = new Map<string, Record<string, unknown>>();
  for (const product of params.products) {
    const productId = String(product.id || "").trim();
    if (!productId) continue;

    const overrides: Record<string, unknown> = {};
    fieldMap.forEach((field, column) => {
      const key = `${productId}::${field.id}`;
      const rows = scopedRowsByProductField.get(key) || [];
      if (rows.length === 0) return;

      const winner = rows
        .map((row) => ({ row, score: scoreScopedFieldValueRow(row, params.scope) }))
        .filter((entry) => entry.score > -500)
        .sort((a, b) => b.score - a.score)[0]?.row;

      if (!winner) return;
      const typedValue = toTypedFieldValue(winner);
      if (typedValue === null || typeof typedValue === "undefined") return;
      overrides[column] = typedValue;
    });

    if (Object.keys(overrides).length > 0) {
      productOverrides.set(productId, overrides);
    }
  }

  if (productOverrides.size === 0) return params.products;

  return params.products.map((product) => {
    const productId = String(product.id || "").trim();
    const overrides = productOverrides.get(productId);
    if (!overrides) return product;
    return {
      ...product,
      ...overrides,
    };
  });
}

async function applyScopedOverridesToProducts(params: {
  products: ProductListRow[];
  scope: ScopeSelection;
  columns?: string[];
}): Promise<ProductListRow[]> {
  if (!hasScopedSelection(params.scope)) return params.products;
  if (params.products.length === 0) return params.products;

  const groups = new Map<string, ProductListRow[]>();
  for (const product of params.products) {
    const organizationId = String(product.organization_id || "").trim();
    if (!organizationId) continue;
    const rows = groups.get(organizationId) || [];
    rows.push(product);
    groups.set(organizationId, rows);
  }

  if (groups.size === 0) return params.products;

  const overridesByProductId = new Map<string, ProductListRow>();
  for (const [organizationId, products] of groups.entries()) {
    const overridden = await applyScopedOverridesForOrganization({
      organizationId,
      products,
      scope: params.scope,
      columns: params.columns,
    });
    overridden.forEach((product) => {
      const productId = String(product.id || "").trim();
      if (!productId) return;
      overridesByProductId.set(productId, product);
    });
  }

  return params.products.map((product) => {
    const productId = String(product.id || "").trim();
    return overridesByProductId.get(productId) || product;
  });
}

function withNormalizedBarcode<T extends Record<string, unknown>>(row: T): T & { barcode: string | null } {
  const barcodeValue = typeof row.barcode === "string" ? row.barcode : null;
  const upcValue = typeof row.upc === "string" ? row.upc : null;

  return {
    ...row,
    barcode: barcodeValue ?? upcValue,
  };
}

type OrganizationLookup = Record<
  string,
  {
    slug: string;
    name: string;
  }
>;

async function fetchProductsForOrganization(params: {
  organizationId: string;
  constrainedProductIds?: string[] | null;
  listMode?: ProductListMode;
}) {
  const isTableMode = params.listMode === "table";
  const selectWithBarcode = isTableMode
    ? PRODUCT_TABLE_SELECT_WITH_BARCODE
    : PRODUCT_SELECT_WITH_BARCODE;
  const selectWithUpc = isTableMode ? PRODUCT_TABLE_SELECT_WITH_UPC : PRODUCT_SELECT_WITH_UPC;

  const buildProductQuery = (selectClause: string) => {
    let query = supabase
      .from("products")
      .select(selectClause)
      .eq("organization_id", params.organizationId)
      .order("created_at", { ascending: false });

    if (params.constrainedProductIds && params.constrainedProductIds.length > 0) {
      query = query.in("id", params.constrainedProductIds);
    }

    return query;
  };

  let productsResult = await buildProductQuery(selectWithBarcode);
  if (productsResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
    productsResult = await buildProductQuery(selectWithUpc);
  }

  const rows = Array.isArray(productsResult.data)
    ? (productsResult.data as unknown[])
        .filter(
          (row): row is ProductListRow =>
            typeof row === "object" && row !== null && !("error" in (row as Record<string, unknown>))
        )
    : [];

  return {
    products: rows.map((row) => withNormalizedBarcode(row)),
    error: productsResult.error,
  };
}

async function resolveOrganizationLookup(organizationIds: string[]): Promise<OrganizationLookup> {
  if (organizationIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("id,slug,name")
    .in("id", organizationIds);

  if (error || !Array.isArray(data)) {
    return {};
  }

  const lookup: OrganizationLookup = {};
  for (const row of data as Array<{ id: string; slug: string; name: string }>) {
    if (!row.id) continue;
    lookup[row.id] = {
      slug: row.slug,
      name: row.name,
    };
  }
  return lookup;
}

// GET /api/[tenant]/products - Fetch products for organization
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const requestUrl = new URL(request.url);
    const scopeSelection = parseScopeSelectionFromSearchParams(requestUrl.searchParams);
    const selectedBrandSlug = requestUrl.searchParams.get("brand");
    const requestedListMode = (requestUrl.searchParams.get("listMode") || "").trim().toLowerCase();
    const requestedInclude = (requestUrl.searchParams.get("include") || "").trim().toLowerCase();
    const requestedFields = (requestUrl.searchParams.get("fields") || "").trim().toLowerCase();
    const requestedViewScope = (requestUrl.searchParams.get("view") || "")
      .trim()
      .toLowerCase();
    const searchQuery = normalizeSearchQuery(
      requestUrl.searchParams.get("q") ?? requestUrl.searchParams.get("search")
    );
    const pagination = parseListPagination(requestUrl.searchParams);
    const listMode: ProductListMode =
      requestedListMode === "table" || requestedInclude === "table" || requestedFields === "table"
        ? "table"
        : "full";
    const scopedListColumns = Array.from(
      listMode === "table" ? TABLE_SCOPED_PRODUCT_LIST_COLUMNS : SCOPED_PRODUCT_LIST_COLUMNS
    );

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
    const listCacheHash = Buffer.from(
      [
        context.userId,
        context.mode,
        context.tenantOrganization.id,
        targetOrganizationId,
        context.selectedBrandSlug || "-",
        requestUrl.searchParams.toString(),
      ].join("|")
    ).toString("base64url");
    const listCacheKey = CacheKeys.productsList(`${targetOrganizationId}:${listCacheHash}`);
    const cachedPayload = await redisCache.get<Record<string, unknown>>(listCacheKey);
    if (cachedPayload) {
      return NextResponse.json(cachedPayload);
    }
    const isPartnerAllViewRequest =
      requestedViewScope === "all" &&
      context.mode === "tenant" &&
      context.tenantOrganization.organizationType === "partner";

    let marketCatalogProductIds: string[] | null = null;
    // Only apply market catalog filter for brand's own view (preview mode).
    // For partner_brand, resolvePartnerGrantedProductIds already handles market access via partner_market_assignments.
    if (context.mode === "tenant" && !isPartnerAllViewRequest && scopeSelection.marketId) {
      const marketCatalog = await resolveMarketCatalogProductIds({
        organizationId: targetOrganizationId,
        marketId: scopeSelection.marketId,
      });

      if (!marketCatalog.foundationAvailable) {
        return NextResponse.json(
          { error: "Market catalog foundation is unavailable. Apply database migrations first." },
          { status: 503 }
        );
      }

      marketCatalogProductIds = marketCatalog.ids;
    }

    if (isPartnerAllViewRequest) {
      const partnerOrganizationId = context.tenantOrganization.id;
      const brandOrganizationIds = await resolvePartnerSharedBrandOrganizationIds({
        partnerOrganizationId,
      });

      const ownProductsResult = await fetchProductsForOrganization({
        organizationId: partnerOrganizationId,
        listMode,
      });
      if (ownProductsResult.error) {
        console.error("Error fetching own products:", ownProductsResult.error);
        return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
      }

      const sharedBrandSets = await Promise.all(
        brandOrganizationIds.map(async (brandOrganizationId) => {
          const granted = await resolvePartnerGrantedProductIds({
            brandOrganizationId,
            partnerOrganizationId,
            scope: {
              marketId: scopeSelection.marketId,
              channelId: scopeSelection.channelId,
              localeId: scopeSelection.localeId,
              destinationId: scopeSelection.destinationId,
            },
          });
          if (!granted.foundationAvailable || granted.productIds.length === 0) {
            return null;
          }
          return {
            brandOrganizationId,
            grantedProductIds: granted.productIds,
          };
        })
      );

      const sharedBrandEntries = sharedBrandSets.filter(
        (
          row
        ): row is {
          brandOrganizationId: string;
          grantedProductIds: string[];
        } => Boolean(row)
      );

      const sharedProductsResults = await Promise.all(
        sharedBrandEntries.map(({ brandOrganizationId, grantedProductIds }) =>
          fetchProductsForOrganization({
            organizationId: brandOrganizationId,
            constrainedProductIds: grantedProductIds,
            listMode,
          })
        )
      );

      for (const result of sharedProductsResults) {
        if (result.error) {
          console.error("Error fetching shared products:", result.error);
          return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
        }
      }

      const mergedProductsById = new Map<string, ProductListRow>();
      for (const row of ownProductsResult.products) {
        mergedProductsById.set(String(row.id), row);
      }
      for (const result of sharedProductsResults) {
        for (const row of result.products) {
          mergedProductsById.set(String(row.id), row);
        }
      }

      const mergedProducts = await applyScopedOverridesToProducts({
        products: Array.from(mergedProductsById.values()),
        scope: scopeSelection,
        columns: scopedListColumns,
      });
      const visibilityFilteredProducts = applyMarketVisibilityFilter({
        products: mergedProducts,
        scope: scopeSelection,
      });
      const organizationLookup = await resolveOrganizationLookup(
        Array.from(
          new Set(
            visibilityFilteredProducts
              .map((product) => String(product.organization_id || "").trim())
              .filter((id) => id.length > 0)
          )
        )
      );

      const products = visibilityFilteredProducts
        .map((product: ProductListRow) => {
          const organizationId = String(product.organization_id || "").trim();
          const sourceOrg = organizationLookup[organizationId];
          return {
            ...product,
            organization_slug: sourceOrg?.slug || null,
            organization_name: sourceOrg?.name || null,
          };
        })
        .sort(
          (a: ProductListRow, b: ProductListRow) =>
            new Date(String(b.created_at || 0)).getTime() -
            new Date(String(a.created_at || 0)).getTime()
        );
      const searchFilteredProducts = filterProductsBySearch(products, searchQuery);
      const pagedProducts = paginateRows(searchFilteredProducts, pagination);

      const payload = {
        success: true,
        data: pagedProducts.rows,
        pagination: pagedProducts.meta,
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
      };
      await redisCache.set(listCacheKey, payload, LIST_CACHE_TTL_SECONDS);
      return NextResponse.json(payload);
    }

    let constrainedProductIds: string[] | null = null;
    let partnerOutputProfileId: string | null = null;
    if (context.mode === "partner_brand") {
      // Resolve channel profile for the partner's selected market (for readiness scoring)
      partnerOutputProfileId = await resolvePartnerEffectiveOutputProfileId({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
        marketId: scopeSelection.marketId,
      });

      const grantedSetProducts = await resolvePartnerGrantedProductIds({
        brandOrganizationId: targetOrganizationId,
        partnerOrganizationId: context.tenantOrganization.id,
        scope: {
          marketId: scopeSelection.marketId,
          channelId: scopeSelection.channelId,
          localeId: scopeSelection.localeId,
          destinationId: scopeSelection.destinationId,
        },
      });

      if (grantedSetProducts.foundationAvailable) {
        constrainedProductIds = grantedSetProducts.productIds;
      } else {
        if (!context.brandMemberId) {
          return NextResponse.json({
            success: true,
            data: [],
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
        }

        const scopedPermissions = await getScopedPermissionSummary({
          organizationId: targetOrganizationId,
          memberId: context.brandMemberId,
          permissionKeys: PRODUCT_VIEW_PERMISSION_KEYS,
        });

        const hasAnyProductScope =
          scopedPermissions.hasOrganizationScope ||
          scopedPermissions.marketIds.length > 0 ||
          scopedPermissions.channelIds.length > 0;

        if (!hasAnyProductScope) {
          return NextResponse.json({
            success: true,
            data: [],
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
        }

        if (
          !scopedPermissions.hasOrganizationScope &&
          scopedPermissions.channelIds.length > 0
        ) {
          const scopedIds = new Set<string>();
          for (const channelId of scopedPermissions.channelIds) {
            const productIds = await getChannelScopedProductIds({
              supabase,
              organizationId: targetOrganizationId,
              channelId,
            });
            for (const productId of productIds || []) {
              scopedIds.add(productId);
            }
          }
          constrainedProductIds = Array.from(scopedIds);
        }
      }
    }

    constrainedProductIds = intersectIds(constrainedProductIds, marketCatalogProductIds);

    if (constrainedProductIds && constrainedProductIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
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
    }

    const productsResult = await fetchProductsForOrganization({
      organizationId: targetOrganizationId,
      constrainedProductIds,
      listMode,
    });

    if (productsResult.error) {
      console.error("Error fetching products:", productsResult.error);
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }

    const scopedProducts = await applyScopedOverridesToProducts({
      products: productsResult.products,
      scope: scopeSelection,
      columns: scopedListColumns,
    });
    const visibleProducts = applyMarketVisibilityFilter({
      products: scopedProducts,
      scope: scopeSelection,
    });

    const searchFilteredProducts = filterProductsBySearch(visibleProducts, searchQuery);
    const products = searchFilteredProducts.map((product) => ({
      ...product,
      organization_slug: context.targetOrganization.slug,
      organization_name: context.targetOrganization.name,
    }));
    const pagedProducts = paginateRows(products, pagination);

    const payload = {
      success: true,
      data: pagedProducts.rows || [],
      pagination: pagedProducts.meta,
      organization: {
        id: context.targetOrganization.id,
        name: context.targetOrganization.name,
        slug: context.targetOrganization.slug,
      },
      view: {
        mode: context.mode,
        selectedBrandSlug: context.selectedBrandSlug,
        tenantSlug: context.tenantOrganization.slug,
        output_profile_id: partnerOutputProfileId,
      },
    };
    await redisCache.set(listCacheKey, payload, LIST_CACHE_TTL_SECONDS);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error in products GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/[tenant]/products - Create new product
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (selectedBrandSlug && selectedBrandSlug.trim().length > 0) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant, "collaborate");
    if (!access.hasAccess) {
      return NextResponse.json(
        {
          error:
            "Access denied. You do not have permission to create products in this organization.",
        },
        { status: 403 }
      );
    }
    const organizationId = access.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "Organization context is missing." }, { status: 500 });
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const body = await request.json();
    const hasInitialScope = Object.prototype.hasOwnProperty.call(body, "initialScope");
    const {
      type = "standalone",
      parent_id,
      product_name,
      sku,
      upc,
      barcode: barcodeFromBody,
      brand_line,
      family_id,
      variant_axis = {},
      status = "Draft",
      launch_date,
      msrp,
      cost_of_goods,
      margin_percent,
      short_description,
      long_description,
      features = [],
      specifications = {},
      meta_title,
      meta_description,
      keywords = [],
      weight_g,
      dimensions = {},
      inheritance = {},
      is_inherited = {},
      marketplace_content = {},
      initialScope,
    } = body;

    const normalizedInitialScope =
      hasInitialScope && initialScope === null
        ? ({
            mode: "global",
            marketIds: [],
            channelIds: [],
            localeIds: [],
            destinationIds: [],
          } as ProductAuthoringScope)
        : hasInitialScope
          ? normalizeProductAuthoringScope(initialScope)
          : null;

    if (hasInitialScope && !normalizedInitialScope) {
      return NextResponse.json(
        { error: "initialScope must be an object or null" },
        { status: 400 }
      );
    }

    const validatedInitialScope = hasInitialScope
      ? await validateAuthoringScope({
          supabase,
          organizationId,
          rawScope: normalizedInitialScope,
        })
      : null;

    if (validatedInitialScope && !validatedInitialScope.ok) {
      return NextResponse.json(
        { error: validatedInitialScope.error },
        { status: validatedInitialScope.status }
      );
    }

    const normalizedMarketplaceContent =
      marketplace_content && typeof marketplace_content === "object" && !Array.isArray(marketplace_content)
        ? { ...(marketplace_content as Record<string, unknown>) }
        : {};
    if (hasInitialScope) {
      normalizedMarketplaceContent.authoringScope =
        validatedInitialScope && validatedInitialScope.ok
          ? validatedInitialScope.scope
          : normalizedInitialScope;
    }

    const barcode = normalizeBarcodeInput(barcodeFromBody) ?? normalizeBarcodeInput(upc);

    if (!product_name || !type) {
      return NextResponse.json(
        { error: "Product name and type are required" },
        { status: 400 }
      );
    }

    if (!["parent", "variant", "standalone"].includes(type)) {
      return NextResponse.json(
        { error: "Type must be parent, variant, or standalone" },
        { status: 400 }
      );
    }

    if (type === "variant" && !parent_id) {
      return NextResponse.json(
        { error: "Parent ID is required for variant products" },
        { status: 400 }
      );
    }

    if (barcode) {
      const barcodeLength = barcode.length;
      if (![8, 12, 13, 14].includes(barcodeLength) || !/^\d+$/.test(barcode)) {
        return NextResponse.json(
          { error: "Barcode must be 8, 12, 13, or 14 digits" },
          { status: 400 }
        );
      }
    }

    const cleanParentId = parent_id && parent_id.trim() !== "" ? parent_id : null;
    const cleanFamilyId =
      typeof family_id === "string" && family_id.trim().length > 0 ? family_id.trim() : null;

    if (!cleanFamilyId) {
      return NextResponse.json(
        { error: "Product model (family_id) is required" },
        { status: 400 }
      );
    }

    if (isBillableSkuRecord({ type, status })) {
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

    const { data: family, error: familyError } = await supabase
      .from("product_families")
      .select("id")
      .eq("id", cleanFamilyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (familyError) {
      console.error("Error validating product family:", familyError);
      return NextResponse.json({ error: "Failed to validate product model" }, { status: 500 });
    }

    if (!family) {
      return NextResponse.json(
        { error: "Product model not found for this organization" },
        { status: 404 }
      );
    }

    const insertPayload: Record<string, unknown> = {
      organization_id: organizationId,
      type,
      parent_id: cleanParentId,
      product_name,
      sku: typeof sku === "string" && sku.trim().length > 0 ? sku.trim() : null,
      barcode: barcode || null,
      brand_line: brand_line || null,
      family_id: cleanFamilyId,
      variant_axis,
      status,
      launch_date,
      msrp,
      cost_of_goods,
      margin_percent,
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
      marketplace_content: normalizedMarketplaceContent,
      created_by: user.id,
    };

    let productResult = await supabase
      .from("products")
      .insert(insertPayload)
      .select(PRODUCT_RETURN_SELECT_WITH_BARCODE)
      .single();

    // Backward compatibility for older schemas still using upc.
    if (productResult.error?.code === UPC_MISSING_COLUMN_ERROR) {
      const legacyPayload: Record<string, unknown> = {
        ...insertPayload,
        upc: insertPayload.barcode,
      };
      delete legacyPayload["barcode"];

      productResult = await supabase
        .from("products")
        .insert(legacyPayload)
        .select(PRODUCT_RETURN_SELECT_WITH_UPC)
        .single();
    }

    const product = productResult.data
      ? withNormalizedBarcode(productResult.data as ProductListRow)
      : null;
    const productError = productResult.error;

    if (productError) {
      if (productError.code === "23505") {
        return NextResponse.json(
          { error: "A product with this SKU already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
    }

    if (product?.id) {
      try {
        await addResourceToGlobalCatalogSet({
          organizationId,
          userId: user.id,
          moduleKey: "products",
          resourceType: type === "variant" ? "variant" : "product",
          resourceId: product.id,
          includeDescendants: type === "parent",
        });
      } catch (error) {
        console.error("Failed to auto-include new product in Global Products set:", error);
      }
    }

    try {
      await Promise.all([
        redisCache.invalidatePattern(`${CacheKeys.productsList(`${organizationId}:`)}*`),
        redisCache.invalidatePattern(`${CacheKeys.apiResponse("products", `${organizationId}:`)}*`),
      ]);
    } catch (cacheError) {
      console.warn("POST /products cache invalidation failed:", cacheError);
    }

    return NextResponse.json(
      {
        success: true,
        data: product,
      },
      { status: 201 }
    );
  } catch (error) {
    const safeError = error instanceof Error ? error : null;
    console.error("FATAL ERROR in products POST:", safeError);
    return NextResponse.json(
      { error: "Internal server error", details: safeError?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
