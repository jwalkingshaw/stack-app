import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { cache as redisCache, CacheKeys, CacheTTL } from "@/lib/redis";
import { resolveStorageDeliveryUrl } from "@/lib/storage-url";
import { normalizeProductFieldValue } from "@/lib/product-field-options";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_PREFIX_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildCdnUrl(s3Key: string | null, s3Url: string | null): string | null {
  return resolveStorageDeliveryUrl({ s3Key, s3Url });
}

type FieldValueRow = {
  product_field_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_json: unknown;
  locale_id: string | null;
  market_id: string | null;
  channel_id: string | null;
  destination_id: string | null;
};

function resolveRawValue(row: FieldValueRow): unknown {
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

// File fields store asset ID â€” try several shapes
function extractAssetId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string" && UUID_RE.test(value)) return value;
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    for (const key of ["id", "assetId", "asset_id"]) {
      if (typeof obj[key] === "string" && UUID_RE.test(obj[key] as string)) {
        return obj[key] as string;
      }
    }
  }
  return null;
}

// Best-scoped value: prefer locale+market match over partial or global
function scopeScore(
  row: FieldValueRow,
  localeId: string | null,
  marketId: string | null,
  channelId: string | null,
  destinationId: string | null
): number {
  if (row.locale_id !== null && row.locale_id !== localeId) return -1;
  if (row.market_id !== null && row.market_id !== marketId) return -1;
  if (row.channel_id !== null && row.channel_id !== channelId) return -1;
  if (row.destination_id !== null && row.destination_id !== destinationId) return -1;
  return (
    (row.locale_id !== null ? 8 : 0) +
    (row.market_id !== null ? 4 : 0) +
    (row.channel_id !== null ? 2 : 0) +
    (row.destination_id !== null ? 1 : 0)
  );
}

function buildCacheKey(params: {
  organizationId: string;
  productId: string;
  profileId: string;
  localeId: string | null;
  marketId: string | null;
  channelId: string | null;
  destinationId: string | null;
}): string {
  const descriptor = [
    `org=${params.organizationId}`,
    `product=${params.productId}`,
    `profile=${params.profileId}`,
    `locale=${params.localeId ?? "-"}`,
    `market=${params.marketId ?? "-"}`,
    `channel=${params.channelId ?? "-"}`,
    `destination=${params.destinationId ?? "-"}`,
  ].join("|");
  return CacheKeys.apiResponse("products:export", descriptor);
}

// GET /api/[tenant]/products/[productId]/export
// Query params:
//   profile  — destination profile code (e.g. "amazon-us") or UUID
//   localeId â€” UUID of the locale to scope field values
//   marketId â€” UUID of the market to scope field values
//   channelId — legacy UUID of the channel to scope field values
//   destinationId â€” UUID of the destination to scope field values
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  const { tenant, productId: rawProductId } = await params;
  const productId = rawProductId.match(UUID_PREFIX_RE)?.[1] ?? rawProductId;
  const { searchParams } = request.nextUrl;
  const profileParam = searchParams.get("profile");
  const localeId = searchParams.get("localeId") ?? null;
  const marketId = searchParams.get("marketId") ?? null;
  const channelId = searchParams.get("channelId") ?? null;
  const destinationId = searchParams.get("destinationId") ?? null;

  if (!profileParam) {
    return NextResponse.json(
      { error: "profile parameter is required (destination profile code or id)" },
      { status: 400 }
    );
  }

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.targetOrganization.id;

    // Load destination profile by code or UUID
    const profileBase = supabase
      .from("output_channel_profiles")
      .select(`
        id, name, code, profile_type, market_id, is_active,
        market:markets(id, name, code),
        field_rules:output_profile_field_rules(field_code, is_required, max_length, notes)
      `)
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    const { data: profileRaw, error: profileError } = await (
      UUID_RE.test(profileParam)
        ? profileBase.eq("id", profileParam)
        : profileBase.eq("code", profileParam)
    ).maybeSingle();

    if (profileError) {
      console.error("Error loading destination profile:", profileError);
      return NextResponse.json({ error: "Failed to load destination profile" }, { status: 500 });
    }
    if (!profileRaw) {
      return NextResponse.json({ error: "Destination profile not found" }, { status: 404 });
    }

    const profile = profileRaw as unknown as {
      id: string;
      name: string;
      code: string;
      profile_type: string;
      market_id: string | null;
      market: { id: string; name: string; code: string } | null;
      field_rules: Array<{
        field_code: string;
        is_required: boolean;
        max_length: number | null;
        notes: string | null;
      }>;
    };

    // Cache check (after profile ID is resolved)
    const cacheKey = buildCacheKey({
      organizationId,
      productId,
      profileId: profile.id,
      localeId,
      marketId,
      channelId,
      destinationId,
    });
    const cached = await redisCache.get<object>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    const allFieldCodes = [...new Set(profile.field_rules.map((r) => r.field_code))];

    if (allFieldCodes.length === 0) {
      const empty = buildResult({
        profile,
        productId,
        localeId,
        marketId,
        channelId,
        destinationId,
        fields: {},
        assets: {},
        missing: [],
        warnings: [],
      });
      await redisCache.set(cacheKey, empty, CacheTTL.API_RESPONSE);
      return NextResponse.json({ success: true, data: empty });
    }

    // Load field definitions (field_type needed to distinguish file fields)
    const { data: fieldDefsRaw, error: fieldDefsError } = await supabase
      .from("product_fields")
      .select("id, code, name, field_type, options, is_localizable")
      .eq("organization_id", organizationId)
      .in("code", allFieldCodes);

    if (fieldDefsError) {
      console.error("Error loading field definitions:", fieldDefsError);
      return NextResponse.json({ error: "Failed to load field definitions" }, { status: 500 });
    }

    const fieldDefs = (fieldDefsRaw ?? []) as Array<{
      id: string;
      code: string;
      name?: string | null;
      field_type: string;
      options?: Record<string, unknown> | null;
      is_localizable: boolean;
    }>;
    const fieldByCode = new Map(fieldDefs.map((f) => [f.code, f]));
    const fieldIds = fieldDefs.map((f) => f.id);

    // Load field values for this product
    let fieldValuesRaw: FieldValueRow[] = [];
    if (fieldIds.length > 0) {
      const { data: valuesRaw, error: valuesError } = await supabase
        .from("product_field_values")
        .select(
          "product_field_id, value_text, value_number, value_boolean, value_json, locale_id, market_id, channel_id, destination_id"
        )
        .eq("product_id", productId)
        .in("product_field_id", fieldIds);

      if (valuesError) {
        console.error("Error loading field values:", valuesError);
        return NextResponse.json({ error: "Failed to load field values" }, { status: 500 });
      }
      fieldValuesRaw = (valuesRaw ?? []) as FieldValueRow[];
    }

    // Pick the best-scoped value per field
    const bestValueByFieldId = new Map<string, FieldValueRow>();
    for (const row of fieldValuesRaw) {
      const score = scopeScore(row, localeId, marketId, channelId, destinationId);
      if (score < 0) continue;
      const current = bestValueByFieldId.get(row.product_field_id);
      if (!current || scopeScore(current, localeId, marketId, channelId, destinationId) < score) {
        bestValueByFieldId.set(row.product_field_id, row);
      }
    }

    // Build output: separate regular fields from file/asset fields
    const fields: Record<string, unknown> = {};
    const assets: Record<string, string | null> = {};
    const assetIdsToResolve = new Map<string, string>(); // field_code â†’ asset_id
    const missing: string[] = [];
    const warnings: Array<{ field: string; issue: string }> = [];

    for (const rule of profile.field_rules) {
      const fieldDef = fieldByCode.get(rule.field_code);
      if (!fieldDef) {
        // Field doesn't exist in this org's schema
        if (rule.is_required) missing.push(rule.field_code);
        continue;
      }

      const valueRow = bestValueByFieldId.get(fieldDef.id) ?? null;
      const rawValue = valueRow ? resolveRawValue(valueRow) : null;
      const normalizedValueResult = normalizeProductFieldValue({
        fieldType: fieldDef.field_type,
        options: fieldDef.options,
        value: rawValue,
        fieldLabel: fieldDef.name ?? fieldDef.code,
      });
      const normalizedValue = normalizedValueResult.error ? rawValue : normalizedValueResult.value;
      const present = isPresent(normalizedValue);

      if (!present) {
        if (rule.is_required) missing.push(rule.field_code);
        if (fieldDef.field_type === "file") assets[rule.field_code] = null;
        continue;
      }

      // Max-length warning for text fields
      if (rule.max_length && typeof valueRow?.value_text === "string") {
        if (valueRow.value_text.length > rule.max_length) {
          warnings.push({
            field: rule.field_code,
            issue: `Exceeds max length of ${rule.max_length} (${valueRow.value_text.length} chars)`,
          });
        }
      }

      if (fieldDef.field_type === "file") {
        const assetId = extractAssetId(normalizedValue);
        if (assetId) {
          assetIdsToResolve.set(rule.field_code, assetId);
        }
        assets[rule.field_code] = null; // resolved below
      } else if (fieldDef.field_type === "measurement") {
        // Return as { value, unit } object
        fields[rule.field_code] = normalizedValue;
      } else if (fieldDef.field_type === "table") {
        // Return as array of row objects
        fields[rule.field_code] = Array.isArray(normalizedValue) ? normalizedValue : normalizedValue;
      } else {
        fields[rule.field_code] = normalizedValue;
      }
    }

    // Batch resolve asset IDs â†’ CDN URLs
    if (assetIdsToResolve.size > 0) {
      const { data: assetsRaw } = await supabase
        .from("dam_assets")
        .select("id, s3_key, s3_url")
        .eq("organization_id", organizationId)
        .in("id", [...assetIdsToResolve.values()]);

      const urlById = new Map<string, string | null>();
      for (const asset of assetsRaw ?? []) {
        urlById.set(
          asset.id as string,
          buildCdnUrl(asset.s3_key as string | null, asset.s3_url as string | null)
        );
      }

      for (const [fieldCode, assetId] of assetIdsToResolve) {
        assets[fieldCode] = urlById.get(assetId) ?? null;
      }
    }

    const result = buildResult({
      profile,
      productId,
      localeId,
      marketId,
      channelId,
      destinationId,
      fields,
      assets,
      missing,
      warnings,
    });
    await redisCache.set(cacheKey, result, CacheTTL.API_RESPONSE);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("Unexpected error in GET /products/[productId]/export:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function buildResult(params: {
  profile: { id: string; name: string; code: string; profile_type: string };
  productId: string;
  localeId: string | null;
  marketId: string | null;
  channelId: string | null;
  destinationId: string | null;
  fields: Record<string, unknown>;
  assets: Record<string, string | null>;
  missing: string[];
  warnings: Array<{ field: string; issue: string }>;
}) {
  return {
    product_id: params.productId,
    profile_id: params.profile.id,
    profile_code: params.profile.code,
    profile_name: params.profile.name,
    profile_type: params.profile.profile_type,
    locale_id: params.localeId,
    market_id: params.marketId,
    channel_id: params.channelId,
    destination_id: params.destinationId,
    exported_at: new Date().toISOString(),
    fields: params.fields,
    assets: params.assets,
    missing: params.missing,
    warnings: params.warnings,
  };
}

