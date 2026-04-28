import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { cache as redisCache, CacheKeys, CacheTTL } from "@/lib/redis";
import { getOutputProfileTemplate } from "@/lib/output-profile-templates";
import { resolveStorageDeliveryUrl } from "@/lib/storage-url";
import {
  buildTemplateDestinationAttributeMappings,
  normalizeDestinationAttributeMappings,
  resolveDestinationAttributeValue,
} from "@/lib/destination-attribute-mappings";
import {
  resolveOrganizationBaselineScope,
  type OrganizationBaselineScope,
} from "@/lib/default-market-locale";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
const MAX_PRODUCTS = 200;

function buildCdnUrl(s3Key: string | null, s3Url: string | null): string | null {
  return resolveStorageDeliveryUrl({ s3Key, s3Url });
}

type FieldValueRow = {
  product_id: string;
  product_field_id: string;
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
  channel: string | null;
  locale: string | null;
};

function resolveRawValue(row: Omit<FieldValueRow, "product_id" | "product_field_id">): unknown {
  return row.value_text ?? row.value_number ?? row.value_boolean ?? row.value_date ?? row.value_datetime ?? row.value_json;
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return false;
}

function extractAssetId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string" && UUID_RE.test(value)) return value;
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    for (const key of ["id", "assetId", "asset_id"]) {
      if (typeof obj[key] === "string" && UUID_RE.test(obj[key] as string)) return obj[key] as string;
    }
  }
  return null;
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

function scoreScopedFieldValueRow(
  row: FieldValueRow,
  scope: {
    localeId: string | null;
    localeCode: string | null;
    marketId: string | null;
    channelId: string | null;
    channelCode: string | null;
    destinationId: string | null;
    destinationCode: string | null;
  },
  baseline: OrganizationBaselineScope | null = null
): number {
  const baselineLocaleCode = baseline?.localeCode ?? null;
  const rowLocaleCode = row.locale ? row.locale.toLowerCase() : null;

  const marketScore = (() => {
    if (scope.marketId) {
      if (row.market_id === scope.marketId) return 32;
      if (baseline?.marketId && row.market_id === baseline.marketId) return 4;
      if (!row.market_id) return 1;
      return -1000;
    }
    if (!row.market_id) return 2;
    if (baseline?.marketId && row.market_id === baseline.marketId) return 1;
    return -1000;
  })();

  const localeScore = (() => {
    if (scope.localeId) {
      if (row.locale_id === scope.localeId) return 24;
      if (scope.localeCode && rowLocaleCode && rowLocaleCode === scope.localeCode.toLowerCase()) {
        return 20;
      }
      if (
        baseline?.localeId &&
        ((row.locale_id && row.locale_id === baseline.localeId) ||
          (baselineLocaleCode && rowLocaleCode && rowLocaleCode === baselineLocaleCode))
      ) {
        return 4;
      }
      if (!row.locale_id && !rowLocaleCode) return 1;
      return -1000;
    }
    if (scope.localeCode) {
      const selectedCode = scope.localeCode.toLowerCase();
      if (rowLocaleCode && rowLocaleCode === selectedCode) return 24;
      if (baselineLocaleCode && rowLocaleCode && rowLocaleCode === baselineLocaleCode) return 4;
      if (!row.locale_id && !rowLocaleCode) return 1;
      return -1000;
    }
    if (!row.locale_id && !rowLocaleCode) return 2;
    if (
      baseline?.localeId &&
      ((row.locale_id && row.locale_id === baseline.localeId) ||
        (baselineLocaleCode && rowLocaleCode && rowLocaleCode === baselineLocaleCode))
    ) {
      return 1;
    }
    return -1000;
  })();

  return (
    marketScore +
    scoreDimensionByIdOrCode({
      rowId: row.channel_id,
      rowCode: row.channel,
      selectedId: scope.channelId,
      selectedCode: scope.channelCode,
      weight: 24,
    }) +
    localeScore +
    scoreDimensionByIdOrCode({
      rowId: row.destination_id,
      selectedId: scope.destinationId,
      selectedCode: scope.destinationCode,
      weight: 16,
    })
  );
}

type ProductBaseRow = {
  id: string;
  product_name: string | null;
  scin: string | null;
  sku: string | null;
  barcode: string | null;
  brand_line: string | null;
  short_description: string | null;
  long_description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  features: unknown;
  specifications: unknown;
  keywords: unknown;
  dimensions: unknown;
  weight_g: number | null;
  launch_date: string | null;
  primary_image_url: string | null;
};

const PRODUCT_BASE_FIELD_CODE_ALIASES: Record<string, keyof ProductBaseRow> = {
  product_name: "product_name",
  title: "product_name",
  scin: "scin",
  sku: "sku",
  barcode: "barcode",
  upc: "barcode",
  brand_line: "brand_line",
  brand: "brand_line",
  short_description: "short_description",
  long_description: "long_description",
  description: "long_description",
  meta_title: "meta_title",
  seo_title: "meta_title",
  meta_description: "meta_description",
  seo_description: "meta_description",
  features: "features",
  bullet_points: "features",
  bullets: "features",
  specifications: "specifications",
  keywords: "keywords",
  dimensions: "dimensions",
  weight_g: "weight_g",
  weight: "weight_g",
  launch_date: "launch_date",
  primary_image_url: "primary_image_url",
};

function getBaseProductValue(product: ProductBaseRow | null, fieldCode: string): unknown {
  if (!product) return null;
  const key = PRODUCT_BASE_FIELD_CODE_ALIASES[fieldCode];
  if (!key) return null;
  return product[key] ?? null;
}

function buildCacheKey(params: {
  organizationId: string;
  profileId: string;
  productIds: string[];
  localeId: string | null;
  marketId: string | null;
  channelId: string | null;
  destinationId: string | null;
  format: string;
}): string {
  const sorted = [...params.productIds].sort();
  const idsHash = createHash("sha1").update(sorted.join(",")).digest("hex");
  const descriptor = [
    `org=${params.organizationId}`,
    `profile=${params.profileId}`,
    `locale=${params.localeId ?? "-"}`,
    `market=${params.marketId ?? "-"}`,
    `channel=${params.channelId ?? "-"}`,
    `destination=${params.destinationId ?? "-"}`,
    `format=${params.format}`,
    `ids=${idsHash}`,
  ].join("|");
  return CacheKeys.apiResponse("products:export:batch", descriptor);
}

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Objects/arrays: JSON-encode and quote
  const json = JSON.stringify(value);
  return `"${json.replace(/"/g, '""')}"`;
}

type ProductExportRow = {
  product_id: string;
  fields: Record<string, unknown>;
  assets: Record<string, string | null>;
  missing: string[];
  warnings: Array<{ field: string; issue: string }>;
};

type ProfileFieldRule = {
  field_code: string;
  is_required: boolean;
  max_length: number | null;
  notes: string | null;
};

type ProfileAttributeMapping = {
  id: string;
  attribute_code: string;
  attribute_label: string;
  source_mode: "shared_field" | "destination_field" | "slot" | "constant";
  source_field_code: string | null;
  override_field_code: string | null;
  source_slot_code: string | null;
  constant_value: string | null;
  resolution_rule: "destination_override_then_base" | "base_only" | "destination_only";
  is_required: boolean;
  max_length: number | null;
  notes: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

function buildCsv(rows: ProductExportRow[], fieldCodes: string[], assetFieldCodes: string[]): string {
  const headers = ["product_id", ...fieldCodes, ...assetFieldCodes.map((c) => `asset:${c}`), "missing", "warnings"];
  const lines: string[] = [headers.map(toCsvValue).join(",")];
  for (const row of rows) {
    const cells = [
      toCsvValue(row.product_id),
      ...fieldCodes.map((c) => toCsvValue(row.fields[c] ?? null)),
      ...assetFieldCodes.map((c) => toCsvValue(row.assets[c] ?? null)),
      toCsvValue(row.missing.join("; ")),
      toCsvValue(row.warnings.map((w) => `${w.field}: ${w.issue}`).join("; ")),
    ];
    lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}

async function resolveProfileFieldRules(params: {
  organizationId: string;
  profileId: string;
  directRules: ProfileFieldRule[];
}): Promise<ProfileFieldRule[]> {
  if (params.directRules.length > 0) {
    return params.directRules;
  }

  const { data: fieldGroupsRaw, error } = await supabase
    .from("field_groups")
    .select(`
      id,
      product_field_group_assignments (
        sort_order,
        product_fields!product_field_id (
          code
        )
      )
    `)
    .eq("organization_id", params.organizationId)
    .eq("source_output_profile_id", params.profileId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !Array.isArray(fieldGroupsRaw)) {
    return [];
  }

  const fallbackRules: Array<ProfileFieldRule & { sort_order: number }> = [];
  for (const group of fieldGroupsRaw as Array<Record<string, unknown>>) {
    const assignments = Array.isArray(group.product_field_group_assignments)
      ? group.product_field_group_assignments
      : [];
    for (const assignment of assignments as Array<Record<string, unknown>>) {
      const productField = Array.isArray(assignment.product_fields)
        ? assignment.product_fields[0]
        : assignment.product_fields;
      const fieldCode =
        productField && typeof productField === "object" && typeof (productField as Record<string, unknown>).code === "string"
          ? String((productField as Record<string, unknown>).code)
          : "";
      if (!fieldCode) continue;
      fallbackRules.push({
        field_code: fieldCode,
        is_required: false,
        max_length: null,
        notes: null,
        sort_order:
          typeof assignment.sort_order === "number" && Number.isFinite(assignment.sort_order)
            ? assignment.sort_order
            : 0,
      });
    }
  }

  const deduped = new Map<string, ProfileFieldRule & { sort_order: number }>();
  for (const rule of fallbackRules.sort((a, b) => a.sort_order - b.sort_order)) {
    if (!deduped.has(rule.field_code)) {
      deduped.set(rule.field_code, rule);
    }
  }

  return Array.from(deduped.values()).map(({ sort_order: _sortOrder, ...rule }) => rule);
}

async function resolveProfileAttributeMappings(params: {
  profileId: string;
  templateKey: string | null;
}) {
  const { data, error } = await supabase
    .from("output_profile_attribute_mappings" as never)
    .select(
      "id,attribute_code,attribute_label,source_mode,source_field_code,override_field_code,source_slot_code,constant_value,resolution_rule,is_required,max_length,notes,sort_order,metadata"
    )
    .eq("profile_id", params.profileId)
    .order("sort_order", { ascending: true })
    .order("attribute_code", { ascending: true });

  if (!error && Array.isArray(data) && data.length > 0) {
    return normalizeDestinationAttributeMappings(data as ProfileAttributeMapping[]);
  }

  if (error) {
    console.error("Failed to load destination attribute mappings:", error);
  }

  const template = params.templateKey ? getOutputProfileTemplate(params.templateKey) : undefined;
  return buildTemplateDestinationAttributeMappings(template);
}

// POST /api/[tenant]/products/export/batch
// Body: { profile_id, product_ids[], locale_id?, market_id?, channel_id?, destination_id?, format?: 'json' | 'csv' }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const profileId = typeof body.profile_id === "string" ? body.profile_id.trim() : null;
  const format = (typeof body.format === "string" ? body.format : "json").toLowerCase();
  const localeId = typeof body.locale_id === "string" ? body.locale_id : null;
  const localeCode = typeof body.locale_code === "string" ? body.locale_code : null;
  const marketId = typeof body.market_id === "string" ? body.market_id : null;
  const channelId =
    typeof body.channel_id === "string"
      ? body.channel_id
      : typeof body.channelId === "string"
        ? body.channelId
        : null;
  const channelCode =
    typeof body.channel_code === "string"
      ? body.channel_code
      : typeof body.channelCode === "string"
        ? body.channelCode
        : null;
  const destinationId =
    typeof body.destination_id === "string"
      ? body.destination_id
      : typeof body.destinationId === "string"
        ? body.destinationId
        : null;
  const destinationCode =
    typeof body.destination_code === "string"
      ? body.destination_code
      : typeof body.destinationCode === "string"
        ? body.destinationCode
        : null;

  if (!profileId || !UUID_RE.test(profileId)) {
    return NextResponse.json({ error: "profile_id is required and must be a UUID" }, { status: 400 });
  }
  if (format !== "json" && format !== "csv") {
    return NextResponse.json({ error: "format must be 'json' or 'csv'" }, { status: 400 });
  }

  // Normalise product_ids — strip slugs, deduplicate, cap at MAX_PRODUCTS
  const rawIds = Array.isArray(body.product_ids) ? body.product_ids : [];
  const productIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawIds) {
    if (typeof raw !== "string") continue;
    const id = raw.trim().match(UUID_PREFIX_RE)?.[1] ?? raw.trim();
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    productIds.push(id);
    if (productIds.length >= MAX_PRODUCTS) break;
  }

  if (productIds.length === 0) {
    return NextResponse.json({ error: "product_ids must be a non-empty array of UUIDs" }, { status: 400 });
  }

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.targetOrganization.id;

    // Cache check (JSON only — CSV is always generated fresh to get correct Content-Disposition)
    const cacheKey = buildCacheKey({
      organizationId,
      profileId,
      productIds,
      localeId,
      marketId,
      channelId,
      destinationId,
      format,
    });
    if (format === "json") {
      const cached = await redisCache.get<object>(cacheKey);
      if (cached) {
        return NextResponse.json({ success: true, data: cached });
      }
    }

    // Load channel first, then rules separately. This is more robust than
    // relying on embedded PostgREST relations during export.
    const { data: profileRaw, error: profileError } = await supabase
      .from("output_channel_profiles")
      .select("id, name, code, profile_type, template_key")
      .eq("id", profileId)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) {
      console.error("Error loading channel:", profileError);
      return NextResponse.json({ error: "Failed to load channel" }, { status: 500 });
    }
    if (!profileRaw) {
      return NextResponse.json({ error: "Channel not found or inactive" }, { status: 404 });
    }

    const { data: ruleRowsRaw, error: rulesError } = await supabase
      .from("output_profile_field_rules")
      .select("field_code, is_required, max_length, notes")
      .eq("profile_id", profileId);

    if (rulesError) {
      console.error("Error loading channel rules:", rulesError);
      return NextResponse.json({ error: "Failed to load channel rules" }, { status: 500 });
    }

    const baseProfile = profileRaw as {
      id: string;
      name: string;
      code: string;
      profile_type: string;
      template_key?: string | null;
    };
    const resolvedFieldRules = await resolveProfileFieldRules({
      organizationId,
      profileId,
      directRules: Array.isArray(ruleRowsRaw)
        ? (ruleRowsRaw as Array<{ field_code: string; is_required: boolean; max_length: number | null; notes: string | null }>)
        : [],
    });
    const profile = {
      ...baseProfile,
      field_rules: resolvedFieldRules,
    };

    const resolvedAttributeMappings = await resolveProfileAttributeMappings({
      profileId,
      templateKey: typeof baseProfile.template_key === "string" ? baseProfile.template_key : null,
    });

    const allFieldCodes = [
      ...new Set(
        [
          ...profile.field_rules.map((r) => r.field_code),
          ...resolvedAttributeMappings.flatMap((mapping) =>
            [mapping.sourceFieldCode, mapping.overrideFieldCode].filter(
              (value): value is string => Boolean(value)
            )
          ),
        ].filter((value): value is string => Boolean(value))
      ),
    ];

    if (allFieldCodes.length === 0) {
      const rows: ProductExportRow[] = productIds.map((id) => ({
        product_id: id,
        fields: {},
        assets: {},
        missing: [],
        warnings: [],
      }));
      return respondWithResult({
        format,
        profile,
        rows,
        fieldCodes: [],
        assetFieldCodes: [],
        cacheKey,
        redisCache,
      });
    }

    // Load field definitions
    const { data: fieldDefsRaw, error: fieldDefsError } = await supabase
      .from("product_fields")
      .select("id, code, field_type, is_localizable")
      .eq("organization_id", organizationId)
      .in("code", allFieldCodes);

    if (fieldDefsError) {
      console.error("Error loading field definitions:", fieldDefsError);
      return NextResponse.json({ error: "Failed to load field definitions" }, { status: 500 });
    }

    const fieldDefs = (fieldDefsRaw ?? []) as Array<{
      id: string;
      code: string;
      field_type: string;
      is_localizable: boolean;
    }>;
    const fieldByCode = new Map(fieldDefs.map((f) => [f.code, f]));
    const fieldIds = fieldDefs.map((f) => f.id);

    const { data: productsRaw, error: productsError } = await supabase
      .from("products")
      .select(
        "id, product_name, scin, sku, barcode, brand_line, short_description, long_description, meta_title, meta_description, features, specifications, keywords, dimensions, weight_g, launch_date, primary_image_url"
      )
      .eq("organization_id", organizationId)
      .in("id", productIds);

    if (productsError) {
      console.error("Error loading products for export:", productsError);
      return NextResponse.json({ error: "Failed to load products for export" }, { status: 500 });
    }

    const productById = new Map(
      ((productsRaw ?? []) as ProductBaseRow[]).map((product) => [product.id, product])
    );

    // Bulk load all field values for all products in one query
    let allValues: FieldValueRow[] = [];
    if (fieldIds.length > 0) {
      const { data: valuesRaw, error: valuesError } = await supabase
        .from("product_field_values")
        .select(
          "product_id, product_field_id, value_text, value_number, value_boolean, value_date, value_datetime, value_json, locale_id, market_id, channel_id, destination_id, channel, locale"
        )
        .in("product_id", productIds)
        .in("product_field_id", fieldIds);

      if (valuesError) {
        console.error("Error loading field values:", valuesError);
        return NextResponse.json(
          { error: valuesError.message || "Failed to load field values" },
          { status: 500 }
        );
      }
      allValues = (valuesRaw ?? []) as FieldValueRow[];
    }

    // Group values by product, then pick best-scoped value per field
    const scope = {
      localeId,
      localeCode,
      marketId,
      channelId,
      channelCode,
      destinationId,
      destinationCode,
    };
    const baselineScope = await resolveOrganizationBaselineScope(supabase, organizationId);
    const bestValueByProductAndField = new Map<string, Map<string, FieldValueRow>>();
    for (const row of allValues) {
      const score = scoreScopedFieldValueRow(row, scope, baselineScope);
      if (score <= -500) continue;
      if (!bestValueByProductAndField.has(row.product_id)) {
        bestValueByProductAndField.set(row.product_id, new Map());
      }
      const fieldMap = bestValueByProductAndField.get(row.product_id)!;
      const current = fieldMap.get(row.product_field_id);
      if (!current || scoreScopedFieldValueRow(current, scope, baselineScope) < score) {
        fieldMap.set(row.product_field_id, row);
      }
    }

    // First pass: identify all asset IDs to resolve across all products
    const allAssetIds = new Set<string>();
    const assetIdByProductField = new Map<string, Map<string, string>>(); // productId → fieldCode → assetId

    for (const productId of productIds) {
      const fieldMap = bestValueByProductAndField.get(productId) ?? new Map();
      for (const rule of profile.field_rules) {
        const fieldDef = fieldByCode.get(rule.field_code);
        if (!fieldDef || (fieldDef.field_type !== "file" && fieldDef.field_type !== "image")) continue;
        const valueRow = fieldMap.get(fieldDef.id) ?? null;
        const rawValue = valueRow ? resolveRawValue(valueRow) : null;
        if (!isPresent(rawValue)) continue;
        const assetId = extractAssetId(rawValue);
        if (!assetId) continue;
        allAssetIds.add(assetId);
        if (!assetIdByProductField.has(productId)) {
          assetIdByProductField.set(productId, new Map());
        }
        assetIdByProductField.get(productId)!.set(rule.field_code, assetId);
      }
    }

    if (resolvedAttributeMappings.length > 0) {
      for (const productId of productIds) {
        const fieldMap = bestValueByProductAndField.get(productId) ?? new Map();
        const product = productById.get(productId) ?? null;
        for (const mapping of resolvedAttributeMappings) {
          for (const fieldCode of [mapping.sourceFieldCode, mapping.overrideFieldCode]) {
            if (!fieldCode) continue;
            const fieldDef = fieldByCode.get(fieldCode);
            if (!fieldDef || (fieldDef.field_type !== "file" && fieldDef.field_type !== "image")) continue;
            const valueRow = fieldMap.get(fieldDef.id) ?? null;
            const rawValue = valueRow
              ? resolveRawValue(valueRow)
              : getBaseProductValue(product, fieldCode);
            if (!isPresent(rawValue)) continue;
            const assetId = extractAssetId(rawValue);
            if (!assetId) continue;
            allAssetIds.add(assetId);
            if (!assetIdByProductField.has(productId)) {
              assetIdByProductField.set(productId, new Map());
            }
            assetIdByProductField.get(productId)!.set(fieldCode, assetId);
          }
        }
      }
    }

    // Batch resolve all asset IDs to CDN URLs
    const assetUrlById = new Map<string, string | null>();
    if (allAssetIds.size > 0) {
      const { data: assetsRaw } = await supabase
        .from("dam_assets")
        .select("id, s3_key, s3_url")
        .eq("organization_id", organizationId)
        .in("id", [...allAssetIds]);

      for (const asset of assetsRaw ?? []) {
        assetUrlById.set(
          asset.id as string,
          buildCdnUrl(asset.s3_key as string | null, asset.s3_url as string | null)
        );
      }
    }

    // Determine which field codes are asset fields (for CSV headers)
    const assetFieldCodes = profile.field_rules
      .filter((r) => {
        const fieldType = fieldByCode.get(r.field_code)?.field_type;
        return fieldType === "file" || fieldType === "image";
      })
      .map((r) => r.field_code);
    const regularFieldCodes = profile.field_rules
      .filter((r) => {
        const t = fieldByCode.get(r.field_code)?.field_type;
        return t && t !== "file" && t !== "image";
      })
      .map((r) => r.field_code);

    const exportAssetFieldCodes =
      resolvedAttributeMappings.length > 0
        ? resolvedAttributeMappings
            .filter((mapping) => {
              const candidates = [mapping.overrideFieldCode, mapping.sourceFieldCode].filter(
                (value): value is string => Boolean(value)
              );
              return candidates.some((fieldCode) => {
                const fieldType = fieldByCode.get(fieldCode)?.field_type;
                return fieldType === "file" || fieldType === "image";
              });
            })
            .map((mapping) => mapping.attributeCode)
        : assetFieldCodes;
    const exportRegularFieldCodes =
      resolvedAttributeMappings.length > 0
        ? resolvedAttributeMappings
            .filter((mapping) => {
              const candidates = [mapping.overrideFieldCode, mapping.sourceFieldCode].filter(
                (value): value is string => Boolean(value)
              );
              return !candidates.some((fieldCode) => {
                const fieldType = fieldByCode.get(fieldCode)?.field_type;
                return fieldType === "file" || fieldType === "image";
              });
            })
            .map((mapping) => mapping.attributeCode)
        : regularFieldCodes;

    // Build per-product export rows
    const rows: ProductExportRow[] = productIds.map((productId) => {
      const fieldMap = bestValueByProductAndField.get(productId) ?? new Map();
      const productAssetIds = assetIdByProductField.get(productId) ?? new Map();
      const product = productById.get(productId) ?? null;

      const fields: Record<string, unknown> = {};
      const assets: Record<string, string | null> = {};
      const missing: string[] = [];
      const warnings: Array<{ field: string; issue: string }> = [];

      const fieldValueByCode = new Map<string, unknown>();
      for (const fieldDef of fieldDefs) {
        const valueRow = fieldMap.get(fieldDef.id) ?? null;
        fieldValueByCode.set(
          fieldDef.code,
          valueRow ? resolveRawValue(valueRow) : getBaseProductValue(product, fieldDef.code)
        );
      }

      if (resolvedAttributeMappings.length > 0) {
        for (const mapping of resolvedAttributeMappings) {
          const rawValue = resolveDestinationAttributeValue({
            mapping,
            fieldValueByCode,
          });
          const present = isPresent(rawValue);

          if (!present) {
            if (mapping.isRequired) missing.push(mapping.attributeCode);
            assets[mapping.attributeCode] = null;
            continue;
          }

          if (mapping.maxLength && typeof rawValue === "string" && rawValue.length > mapping.maxLength) {
            warnings.push({
              field: mapping.attributeCode,
              issue: `Exceeds max length of ${mapping.maxLength} (${rawValue.length} chars)`,
            });
          }

          const resolvedFieldCode =
            mapping.sourceMode === "shared_field"
              ? mapping.resolutionRule === "destination_only"
                ? mapping.overrideFieldCode ?? mapping.sourceFieldCode
                : mapping.resolutionRule === "destination_override_then_base" &&
                    mapping.overrideFieldCode &&
                    isPresent(fieldValueByCode.get(mapping.overrideFieldCode))
                  ? mapping.overrideFieldCode
                  : mapping.sourceFieldCode
              : mapping.sourceFieldCode;

          const resolvedFieldType = resolvedFieldCode
            ? fieldByCode.get(resolvedFieldCode)?.field_type ?? null
            : null;

          if (resolvedFieldType === "file" || resolvedFieldType === "image") {
            const assetId = resolvedFieldCode ? productAssetIds.get(resolvedFieldCode) ?? null : null;
            assets[mapping.attributeCode] = assetId ? (assetUrlById.get(assetId) ?? null) : null;
          } else {
            fields[mapping.attributeCode] = rawValue;
          }
        }
      } else {
        for (const rule of profile.field_rules) {
          const fieldDef = fieldByCode.get(rule.field_code);
          if (!fieldDef) {
            if (rule.is_required) missing.push(rule.field_code);
            continue;
          }

          const valueRow = fieldMap.get(fieldDef.id) ?? null;
          const rawValue = valueRow ? resolveRawValue(valueRow) : getBaseProductValue(product, rule.field_code);
          const present = isPresent(rawValue);

          if (!present) {
            if (rule.is_required) missing.push(rule.field_code);
            if (fieldDef.field_type === "file" || fieldDef.field_type === "image") assets[rule.field_code] = null;
            continue;
          }

          if (rule.max_length && typeof valueRow?.value_text === "string") {
            if (valueRow.value_text.length > rule.max_length) {
              warnings.push({
                field: rule.field_code,
                issue: `Exceeds max length of ${rule.max_length} (${valueRow.value_text.length} chars)`,
              });
            }
          }

          if (fieldDef.field_type === "file" || fieldDef.field_type === "image") {
            const assetId = productAssetIds.get(rule.field_code) ?? null;
            assets[rule.field_code] = assetId ? (assetUrlById.get(assetId) ?? null) : null;
          } else {
            fields[rule.field_code] = rawValue;
          }
        }
      }

      return { product_id: productId, fields, assets, missing, warnings };
    });

    return respondWithResult({
      format,
      profile,
      rows,
      fieldCodes: exportRegularFieldCodes,
      assetFieldCodes: exportAssetFieldCodes,
      cacheKey,
      redisCache,
    });
  } catch (err) {
    console.error("Unexpected error in POST /products/export/batch:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

async function respondWithResult(params: {
  format: string;
  profile: { id: string; name: string; code: string; profile_type: string };
  rows: ProductExportRow[];
  fieldCodes: string[];
  assetFieldCodes: string[];
  cacheKey: string;
  redisCache: typeof import("@/lib/redis").cache;
}): Promise<NextResponse> {
  const { format, profile, rows, fieldCodes, assetFieldCodes, cacheKey } = params;

  if (format === "csv") {
    const csv = buildCsv(rows, fieldCodes, assetFieldCodes);
    const filename = `export-${profile.code}-${Date.now()}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const result = {
    profile_id: profile.id,
    profile_code: profile.code,
    profile_name: profile.name,
    profile_type: profile.profile_type,
    exported_at: new Date().toISOString(),
    count: rows.length,
    rows,
  };
  await params.redisCache.set(cacheKey, result, CacheTTL.API_RESPONSE);
  return NextResponse.json({ success: true, data: result });
}
