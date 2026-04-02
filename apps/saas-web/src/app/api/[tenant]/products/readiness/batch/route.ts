import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { cache as redisCache, CacheKeys } from "@/lib/redis";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
const MAX_PRODUCT_IDS = 300;
const READINESS_CACHE_TTL_SECONDS = 60;

type PrimaryProfile = {
  id: string;
  name: string;
  code: string;
  profile_type: string;
  is_primary: boolean;
  field_rules: Array<{
    field_code: string;
    is_required: boolean;
    max_length: number | null;
  }>;
};

function normalizeRequestedProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const match = trimmed.match(UUID_PREFIX_PATTERN);
    const candidateId = match?.[1] || trimmed;
    if (!UUID_PATTERN.test(candidateId)) continue;
    deduped.add(candidateId);
    if (deduped.size >= MAX_PRODUCT_IDS) break;
  }
  return Array.from(deduped);
}

function isFieldValuePresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return false;
}

function buildCacheKey(params: {
  organizationId: string;
  marketId: string | null;
  localeId: string | null;
  productIds: string[];
}): string {
  const sortedIds = [...params.productIds].sort();
  const idsHash = createHash("sha1").update(sortedIds.join(",")).digest("hex");
  const descriptor = [
    `org=${params.organizationId}`,
    `market=${params.marketId || "-"}`,
    `locale=${params.localeId || "-"}`,
    `ids=${idsHash}`,
  ].join("|");
  return CacheKeys.apiResponse("products:readiness:batch", descriptor);
}

type BatchResult = {
  profile: { id: string; name: string; profile_type: string } | null;
  scores: Record<string, number>;
};

// POST /api/[tenant]/products/readiness/batch
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const searchParams = new URL(request.url).searchParams;
    const selectedBrandSlug = searchParams.get("brand");
    const marketId = searchParams.get("marketId")?.trim() || null;
    const localeId = searchParams.get("localeId")?.trim() || null;

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) return contextResult.response;

    const organizationId = contextResult.context.targetOrganization.id;

    const payload = (await request.json().catch(() => null)) as {
      productIds?: unknown;
    } | null;
    const productIds = normalizeRequestedProductIds(payload?.productIds || []);

    if (productIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { profile: null, scores: {} } satisfies BatchResult,
      });
    }

    // Check cache
    const cacheKey = buildCacheKey({ organizationId, marketId, localeId, productIds });
    const cached = await redisCache.get<unknown>(cacheKey);
    if (cached && typeof cached === "object" && "profile" in (cached as object)) {
      return NextResponse.json({ success: true, data: cached, cached: true });
    }

    // Load primary profile with its field rules
    const { data: profilesRaw, error: profilesError } = await supabase
      .from("output_channel_profiles")
      .select(
        "id,name,code,profile_type,is_primary,field_rules:output_profile_field_rules(field_code,is_required,max_length)"
      )
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle();

    if (profilesError) {
      // is_primary column may not exist yet (migration not applied)
      if (profilesError.code === "42703") {
        return NextResponse.json({
          success: true,
          data: { profile: null, scores: {} } satisfies BatchResult,
        });
      }
      console.error("readiness/batch: error loading primary profile:", profilesError);
      return NextResponse.json({ error: "Failed to load primary profile" }, { status: 500 });
    }

    if (!profilesRaw) {
      // No primary profile set — nothing to score against
      return NextResponse.json({
        success: true,
        data: { profile: null, scores: {} } satisfies BatchResult,
      });
    }

    const profile = profilesRaw as PrimaryProfile;
    const requiredRules = profile.field_rules.filter((r) => r.is_required);

    if (requiredRules.length === 0) {
      // Profile has no required rules — every product scores 100%
      const scores: Record<string, number> = {};
      for (const id of productIds) scores[id] = 100;
      const result: BatchResult = {
        profile: { id: profile.id, name: profile.name, profile_type: profile.profile_type },
        scores,
      };
      await redisCache.set(cacheKey, result, READINESS_CACHE_TTL_SECONDS);
      return NextResponse.json({ success: true, data: result });
    }

    const requiredFieldCodes = requiredRules.map((r) => r.field_code);

    // Resolve field codes → IDs for this org
    const { data: fieldsRaw, error: fieldsError } = await supabase
      .from("product_fields")
      .select("id,code")
      .eq("organization_id", organizationId)
      .in("code", requiredFieldCodes);

    if (fieldsError) {
      console.error("readiness/batch: error loading field defs:", fieldsError);
      return NextResponse.json({ error: "Failed to load field definitions" }, { status: 500 });
    }

    const fieldById = new Map(
      (fieldsRaw || []).map((f) => [f.id as string, f.code as string])
    );
    const fieldIds = Array.from(fieldById.keys());

    // Bulk-load field values for all requested products in one query
    type ValueRow = {
      product_id: string;
      product_field_id: string;
      value_text: string | null;
      value_number: number | null;
      value_boolean: boolean | null;
      value_json: unknown;
      locale_id: string | null;
      market_id: string | null;
    };

    let fieldValues: ValueRow[] = [];
    if (fieldIds.length > 0) {
      const valQuery = supabase
        .from("product_field_values")
        .select(
          "product_id,product_field_id,value_text,value_number,value_boolean,value_json,locale_id,market_id"
        )
        .eq("organization_id", organizationId)
        .in("product_id", productIds)
        .in("product_field_id", fieldIds);

      const { data: valuesRaw, error: valuesError } = await valQuery;
      if (valuesError) {
        console.error("readiness/batch: error loading field values:", valuesError);
        return NextResponse.json({ error: "Failed to load field values" }, { status: 500 });
      }
      fieldValues = (valuesRaw || []) as ValueRow[];
    }

    // Group values by product ID, then determine populated field IDs per product
    const populatedFieldIdsByProduct = new Map<string, Set<string>>();
    for (const row of fieldValues) {
      if (row.market_id && marketId && row.market_id !== marketId) continue;
      if (row.locale_id && localeId && row.locale_id !== localeId) continue;
      const val =
        row.value_text ?? row.value_number ?? row.value_boolean ?? row.value_json;
      if (!isFieldValuePresent(val)) continue;

      if (!populatedFieldIdsByProduct.has(row.product_id)) {
        populatedFieldIdsByProduct.set(row.product_id, new Set());
      }
      populatedFieldIdsByProduct.get(row.product_id)!.add(row.product_field_id);
    }

    // Score each product
    const totalRequired = requiredFieldCodes.length;
    const scores: Record<string, number> = {};
    for (const productId of productIds) {
      const populated = populatedFieldIdsByProduct.get(productId);
      if (!populated || populated.size === 0) {
        scores[productId] = totalRequired === 0 ? 100 : 0;
        continue;
      }
      let completeCount = 0;
      for (const fieldId of fieldIds) {
        const code = fieldById.get(fieldId);
        if (code && requiredFieldCodes.includes(code) && populated.has(fieldId)) {
          completeCount++;
        }
      }
      scores[productId] =
        totalRequired === 0 ? 100 : Math.round((completeCount / totalRequired) * 100);
    }

    const result: BatchResult = {
      profile: { id: profile.id, name: profile.name, profile_type: profile.profile_type },
      scores,
    };

    await redisCache.set(cacheKey, result, READINESS_CACHE_TTL_SECONDS);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in readiness batch API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
