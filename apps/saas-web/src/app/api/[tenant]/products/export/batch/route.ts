import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { cache as redisCache, CacheKeys, CacheTTL } from "@/lib/redis";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
const MAX_PRODUCTS = 200;

const configuredCloudFrontDomain = process.env.AWS_CLOUDFRONT_DOMAIN ?? null;

function buildCdnUrl(s3Key: string | null, s3Url: string | null): string | null {
  if (configuredCloudFrontDomain && s3Key) {
    return `https://${configuredCloudFrontDomain}/${s3Key.replace(/^\/+/, "")}`;
  }
  return s3Url ?? null;
}

type FieldValueRow = {
  product_id: string;
  product_field_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_json: unknown;
  locale_id: string | null;
  market_id: string | null;
};

function resolveRawValue(row: Omit<FieldValueRow, "product_id" | "product_field_id">): unknown {
  return row.value_text ?? row.value_number ?? row.value_boolean ?? row.value_json;
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

function scopeScore(row: FieldValueRow, localeId: string | null, marketId: string | null): number {
  if (row.locale_id !== null && row.locale_id !== localeId) return -1;
  if (row.market_id !== null && row.market_id !== marketId) return -1;
  return (row.locale_id !== null ? 2 : 0) + (row.market_id !== null ? 1 : 0);
}

function buildCacheKey(params: {
  organizationId: string;
  profileId: string;
  productIds: string[];
  localeId: string | null;
  marketId: string | null;
  format: string;
}): string {
  const sorted = [...params.productIds].sort();
  const idsHash = createHash("sha1").update(sorted.join(",")).digest("hex");
  const descriptor = [
    `org=${params.organizationId}`,
    `profile=${params.profileId}`,
    `locale=${params.localeId ?? "-"}`,
    `market=${params.marketId ?? "-"}`,
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

// POST /api/[tenant]/products/export/batch
// Body: { profile_id, product_ids[], locale_id?, market_id?, format?: 'json' | 'csv' }
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
  const marketId = typeof body.market_id === "string" ? body.market_id : null;

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
    const cacheKey = buildCacheKey({ organizationId, profileId, productIds, localeId, marketId, format });
    if (format === "json") {
      const cached = await redisCache.get<object>(cacheKey);
      if (cached) {
        return NextResponse.json({ success: true, data: cached });
      }
    }

    // Load profile + field rules
    const { data: profileRaw, error: profileError } = await supabase
      .from("output_channel_profiles")
      .select(`
        id, name, code, profile_type,
        field_rules:output_profile_field_rules(field_code, is_required, max_length, notes)
      `)
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

    const profile = profileRaw as {
      id: string;
      name: string;
      code: string;
      profile_type: string;
      field_rules: Array<{ field_code: string; is_required: boolean; max_length: number | null; notes: string | null }>;
    };

    const allFieldCodes = [...new Set(profile.field_rules.map((r) => r.field_code))];

    if (allFieldCodes.length === 0) {
      const rows: ProductExportRow[] = productIds.map((id) => ({
        product_id: id,
        fields: {},
        assets: {},
        missing: [],
        warnings: [],
      }));
      return respondWithResult({ format, profile, rows, fieldCodes: [], assetFieldCodes: [], cacheKey, redisCache });
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

    // Bulk load all field values for all products in one query
    let allValues: FieldValueRow[] = [];
    if (fieldIds.length > 0) {
      const { data: valuesRaw, error: valuesError } = await supabase
        .from("product_field_values")
        .select("product_id, product_field_id, value_text, value_number, value_boolean, value_json, locale_id, market_id")
        .eq("organization_id", organizationId)
        .in("product_id", productIds)
        .in("product_field_id", fieldIds);

      if (valuesError) {
        console.error("Error loading field values:", valuesError);
        return NextResponse.json({ error: "Failed to load field values" }, { status: 500 });
      }
      allValues = (valuesRaw ?? []) as FieldValueRow[];
    }

    // Group values by product, then pick best-scoped value per field
    const bestValueByProductAndField = new Map<string, Map<string, FieldValueRow>>();
    for (const row of allValues) {
      const score = scopeScore(row, localeId, marketId);
      if (score < 0) continue;
      if (!bestValueByProductAndField.has(row.product_id)) {
        bestValueByProductAndField.set(row.product_id, new Map());
      }
      const fieldMap = bestValueByProductAndField.get(row.product_id)!;
      const current = fieldMap.get(row.product_field_id);
      if (!current || scopeScore(current, localeId, marketId) < score) {
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
        if (!fieldDef || fieldDef.field_type !== "file") continue;
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
      .filter((r) => fieldByCode.get(r.field_code)?.field_type === "file")
      .map((r) => r.field_code);
    const regularFieldCodes = profile.field_rules
      .filter((r) => {
        const t = fieldByCode.get(r.field_code)?.field_type;
        return t && t !== "file";
      })
      .map((r) => r.field_code);

    // Build per-product export rows
    const rows: ProductExportRow[] = productIds.map((productId) => {
      const fieldMap = bestValueByProductAndField.get(productId) ?? new Map();
      const productAssetIds = assetIdByProductField.get(productId) ?? new Map();

      const fields: Record<string, unknown> = {};
      const assets: Record<string, string | null> = {};
      const missing: string[] = [];
      const warnings: Array<{ field: string; issue: string }> = [];

      for (const rule of profile.field_rules) {
        const fieldDef = fieldByCode.get(rule.field_code);
        if (!fieldDef) {
          if (rule.is_required) missing.push(rule.field_code);
          continue;
        }

        const valueRow = fieldMap.get(fieldDef.id) ?? null;
        const rawValue = valueRow ? resolveRawValue(valueRow) : null;
        const present = isPresent(rawValue);

        if (!present) {
          if (rule.is_required) missing.push(rule.field_code);
          if (fieldDef.field_type === "file") assets[rule.field_code] = null;
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

        if (fieldDef.field_type === "file") {
          const assetId = productAssetIds.get(rule.field_code) ?? null;
          assets[rule.field_code] = assetId ? (assetUrlById.get(assetId) ?? null) : null;
        } else {
          fields[rule.field_code] = rawValue;
        }
      }

      return { product_id: productId, fields, assets, missing, warnings };
    });

    return respondWithResult({ format, profile, rows, fieldCodes: regularFieldCodes, assetFieldCodes, cacheKey, redisCache });
  } catch (err) {
    console.error("Unexpected error in POST /products/export/batch:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
