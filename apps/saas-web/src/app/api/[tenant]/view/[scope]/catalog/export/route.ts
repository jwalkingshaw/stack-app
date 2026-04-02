import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  resolveTenantBrandViewContext,
  resolvePartnerGrantedProductIds,
  resolvePartnerMarketOutputProfileId,
} from "@/lib/partner-brand-view";
import { cache as redisCache, CacheKeys, CacheTTL } from "@/lib/redis";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PRODUCTS = 500;
const configuredCloudFrontDomain = process.env.AWS_CLOUDFRONT_DOMAIN ?? null;

// ---------------------------------------------------------------------------
// Helpers (mirrors batch export logic)
// ---------------------------------------------------------------------------

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

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
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

// ---------------------------------------------------------------------------
// GET /api/[tenant]/view/[scope]/catalog/export
// Query params: format=csv|json (default csv), marketId=uuid, localeId=uuid
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; scope: string }> }
) {
  try {
    const { tenant, scope } = await params;

    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
    const marketId = url.searchParams.get("marketId") ?? null;
    const localeId = url.searchParams.get("localeId") ?? null;

    if (format !== "csv" && format !== "json") {
      return NextResponse.json({ error: "format must be 'csv' or 'json'" }, { status: 400 });
    }

    // Resolve partner auth + brand access
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: scope,
    });
    if (!contextResult.ok) return contextResult.response;

    const { context } = contextResult;

    // This endpoint is only valid for partner → brand views
    if (context.mode !== "partner_brand") {
      return NextResponse.json({ error: "Catalog export is only available in partner view" }, { status: 403 });
    }

    const brandOrganizationId = context.targetOrganization.id;
    const partnerOrganizationId = context.tenantOrganization.id;

    // Resolve which products this partner can see
    const grantedResult = await resolvePartnerGrantedProductIds({
      brandOrganizationId,
      partnerOrganizationId,
      scope: marketId ? { marketId } : undefined,
    });

    if (!grantedResult.foundationAvailable) {
      return NextResponse.json({ error: "Sharing not available for this brand" }, { status: 404 });
    }

    const productIds = grantedResult.productIds.slice(0, MAX_PRODUCTS);

    if (productIds.length === 0) {
      // Return empty export rather than an error — partner has no products yet
      if (format === "csv") {
        return new NextResponse("product_id,missing,warnings\r\n", {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="catalog-${scope}-empty.csv"`,
          },
        });
      }
      return NextResponse.json({
        success: true,
        data: { profile_id: null, profile_name: null, exported_at: new Date().toISOString(), count: 0, rows: [] },
      });
    }

    // Resolve output profile: market assignment first, then brand primary
    let profileId: string | null = null;

    if (marketId && UUID_RE.test(marketId)) {
      profileId = await resolvePartnerMarketOutputProfileId({
        brandOrganizationId,
        partnerOrganizationId,
        marketId,
      });
    }

    if (!profileId) {
      // Fall back to the brand's primary output profile
      const { data: primaryProfile } = await supabase
        .from("output_channel_profiles")
        .select("id")
        .eq("organization_id", brandOrganizationId)
        .eq("is_primary", true)
        .eq("is_active", true)
        .maybeSingle();
      profileId = (primaryProfile as { id: string } | null)?.id ?? null;
    }

    if (!profileId) {
      // No profile configured — export raw product IDs only
      if (format === "csv") {
        const csv = ["product_id", ...productIds].join("\r\n");
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="catalog-${scope}-${Date.now()}.csv"`,
          },
        });
      }
      return NextResponse.json({
        success: true,
        data: { profile_id: null, profile_name: null, exported_at: new Date().toISOString(), count: productIds.length, rows: productIds.map((id) => ({ product_id: id, fields: {}, assets: {}, missing: [], warnings: [] })) },
      });
    }

    // Cache check (JSON only)
    const idsHash = createHash("sha1").update([...productIds].sort().join(",")).digest("hex");
    const cacheDescriptor = [
      `org=${brandOrganizationId}`,
      `partner=${partnerOrganizationId}`,
      `profile=${profileId}`,
      `locale=${localeId ?? "-"}`,
      `market=${marketId ?? "-"}`,
      `format=${format}`,
      `ids=${idsHash}`,
    ].join("|");
    const cacheKey = CacheKeys.apiResponse("partner:catalog:export", cacheDescriptor);

    if (format === "json") {
      const cached = await redisCache.get<object>(cacheKey);
      if (cached) {
        return NextResponse.json({ success: true, data: cached });
      }
    }

    // Load profile + field rules (scoped to the BRAND org)
    const { data: profileRaw, error: profileError } = await supabase
      .from("output_channel_profiles")
      .select(`
        id, name, code, profile_type,
        field_rules:output_profile_field_rules(field_code, is_required, max_length, notes)
      `)
      .eq("id", profileId)
      .eq("organization_id", brandOrganizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (profileError || !profileRaw) {
      return NextResponse.json({ error: "Channel profile not found" }, { status: 404 });
    }

    const profile = profileRaw as {
      id: string; name: string; code: string; profile_type: string;
      field_rules: Array<{ field_code: string; is_required: boolean; max_length: number | null; notes: string | null }>;
    };

    const allFieldCodes = [...new Set(profile.field_rules.map((r) => r.field_code))];

    if (allFieldCodes.length === 0) {
      const rows: ProductExportRow[] = productIds.map((id) => ({
        product_id: id, fields: {}, assets: {}, missing: [], warnings: [],
      }));
      return buildResponse({ format, profile, rows, fieldCodes: [], assetFieldCodes: [], cacheKey, scope });
    }

    // Load field definitions (brand org)
    const { data: fieldDefsRaw, error: fieldDefsError } = await supabase
      .from("product_fields")
      .select("id, code, field_type, is_localizable")
      .eq("organization_id", brandOrganizationId)
      .in("code", allFieldCodes);

    if (fieldDefsError) {
      return NextResponse.json({ error: "Failed to load field definitions" }, { status: 500 });
    }

    const fieldDefs = (fieldDefsRaw ?? []) as Array<{ id: string; code: string; field_type: string; is_localizable: boolean }>;
    const fieldByCode = new Map(fieldDefs.map((f) => [f.code, f]));
    const fieldIds = fieldDefs.map((f) => f.id);

    // Bulk load field values
    let allValues: FieldValueRow[] = [];
    if (fieldIds.length > 0) {
      const { data: valuesRaw, error: valuesError } = await supabase
        .from("product_field_values")
        .select("product_id, product_field_id, value_text, value_number, value_boolean, value_json, locale_id, market_id")
        .eq("organization_id", brandOrganizationId)
        .in("product_id", productIds)
        .in("product_field_id", fieldIds);

      if (valuesError) {
        return NextResponse.json({ error: "Failed to load field values" }, { status: 500 });
      }
      allValues = (valuesRaw ?? []) as FieldValueRow[];
    }

    // Pick best-scoped value per product per field
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

    // Collect asset IDs
    const allAssetIds = new Set<string>();
    const assetIdByProductField = new Map<string, Map<string, string>>();
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
        if (!assetIdByProductField.has(productId)) assetIdByProductField.set(productId, new Map());
        assetIdByProductField.get(productId)!.set(rule.field_code, assetId);
      }
    }

    // Resolve asset CDN URLs
    const assetUrlById = new Map<string, string | null>();
    if (allAssetIds.size > 0) {
      const { data: assetsRaw } = await supabase
        .from("dam_assets")
        .select("id, s3_key, s3_url")
        .eq("organization_id", brandOrganizationId)
        .in("id", [...allAssetIds]);
      for (const asset of assetsRaw ?? []) {
        assetUrlById.set(asset.id as string, buildCdnUrl(asset.s3_key as string | null, asset.s3_url as string | null));
      }
    }

    const assetFieldCodes = profile.field_rules
      .filter((r) => fieldByCode.get(r.field_code)?.field_type === "file")
      .map((r) => r.field_code);
    const regularFieldCodes = profile.field_rules
      .filter((r) => { const t = fieldByCode.get(r.field_code)?.field_type; return t && t !== "file"; })
      .map((r) => r.field_code);

    // Build export rows
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
            warnings.push({ field: rule.field_code, issue: `Exceeds max length of ${rule.max_length} (${valueRow.value_text.length} chars)` });
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

    return buildResponse({ format, profile, rows, fieldCodes: regularFieldCodes, assetFieldCodes, cacheKey, scope });
  } catch (err) {
    console.error("Unexpected error in GET catalog/export:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function buildResponse(params: {
  format: string;
  profile: { id: string; name: string; code: string; profile_type: string };
  rows: ProductExportRow[];
  fieldCodes: string[];
  assetFieldCodes: string[];
  cacheKey: string;
  scope: string;
}): Promise<NextResponse> {
  const { format, profile, rows, fieldCodes, assetFieldCodes, cacheKey, scope } = params;

  if (format === "csv") {
    const csv = buildCsv(rows, fieldCodes, assetFieldCodes);
    const filename = `catalog-${scope}-${profile.code}-${Date.now()}.csv`;
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
  await redisCache.set(cacheKey, result, CacheTTL.API_RESPONSE);
  return NextResponse.json({ success: true, data: result });
}
