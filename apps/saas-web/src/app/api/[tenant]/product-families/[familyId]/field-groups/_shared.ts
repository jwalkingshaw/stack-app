import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";
import { cache as redisCache, CacheKeys, CacheTTL } from "@/lib/redis";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

function normalizeCode(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function fieldGroupsCacheKey(params: { organizationId: string; familyId: string }): string {
  return CacheKeys.apiResponse("family-field-groups", `${params.organizationId}:${params.familyId}`);
}

export async function getFamilyFieldGroupsCache(params: {
  organizationId: string;
  familyId: string;
}): Promise<unknown[] | null> {
  return redisCache.get<unknown[]>(fieldGroupsCacheKey(params));
}

export async function setFamilyFieldGroupsCache(params: {
  organizationId: string;
  familyId: string;
  data: unknown[];
}): Promise<void> {
  await redisCache.set(fieldGroupsCacheKey(params), params.data, CacheTTL.PRODUCT_FAMILIES);
}

export async function invalidateFamilyFieldGroupsCache(params: {
  organizationId: string;
  familyId: string;
}): Promise<void> {
  await redisCache.del(fieldGroupsCacheKey(params));
}

export async function resolveFamilyContext(params: {
  request: NextRequest;
  tenant: string;
  familyKey: string;
}) {
  const selectedBrandSlug = new URL(params.request.url).searchParams.get("brand");

  const contextResult = await resolveTenantBrandViewContext({
    request: params.request,
    tenantSlug: params.tenant,
    selectedBrandSlug,
  });
  if (!contextResult.ok) {
    return {
      ok: false as const,
      response: contextResult.response,
    };
  }

  const organizationId = contextResult.context.targetOrganization.id;
  const familyId = await resolveFamilyId({
    organizationId,
    familyKey: params.familyKey,
  });

  if (!familyId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Product family not found" }, { status: 404 }),
    };
  }

  return {
    ok: true as const,
    organizationId,
    selectedBrandSlug,
    familyId,
    mode: contextResult.context.mode,
    partnerOrganizationId:
      contextResult.context.tenantOrganization.organizationType === "partner"
        ? contextResult.context.tenantOrganization.id
        : null,
  };
}

async function resolveFamilyId(params: {
  organizationId: string;
  familyKey: string;
}): Promise<string | null> {
  const { organizationId, familyKey } = params;

  if (UUID_PATTERN.test(familyKey)) {
    const byId = await supabase
      .from("product_families")
      .select("id")
      .eq("id", familyKey)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (byId.data?.id) return byId.data.id;
  }

  const byCode = await supabase
    .from("product_families")
    .select("id")
    .eq("code", normalizeCode(familyKey))
    .eq("organization_id", organizationId)
    .maybeSingle();

  return byCode.data?.id || null;
}

