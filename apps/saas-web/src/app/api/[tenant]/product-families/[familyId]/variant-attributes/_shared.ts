import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

export 
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VARIANT_ATTRIBUTES_CACHE_TTL_MS = 60_000;
export type VariantAttributeRecord = {
  id: string;
  product_field_id: string;
  field_code: string;
  field_name: string;
  field_type: string;
  field_description: string | null;
  sort_order: number;
  is_required: boolean;
  validation_rules: Record<string, unknown>;
  options: Record<string, unknown>;
};

const variantAttributesResponseCache = new Map<
  string,
  { expiresAt: number; data: VariantAttributeRecord[] }
>();

function normalizeCode(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

export function getVariantAttributesCache(params: { organizationId: string; familyId: string }) {
  const key = `${params.organizationId}:${params.familyId}`;
  const cached = variantAttributesResponseCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    variantAttributesResponseCache.delete(key);
    return null;
  }
  return cached.data;
}

export function setVariantAttributesCache(params: {
  organizationId: string;
  familyId: string;
  data: VariantAttributeRecord[];
}) {
  const key = `${params.organizationId}:${params.familyId}`;
  variantAttributesResponseCache.set(key, {
    expiresAt: Date.now() + VARIANT_ATTRIBUTES_CACHE_TTL_MS,
    data: params.data,
  });
}

export function invalidateVariantAttributesCache(params: {
  organizationId: string;
  familyId: string;
}) {
  const key = `${params.organizationId}:${params.familyId}`;
  variantAttributesResponseCache.delete(key);
}

async function resolveFamilyId(params: {
  organizationId: string;
  familyKey: string;
}): Promise<string | null> {
  const { organizationId, familyKey } = params;

  if (UUID_PATTERN.test(familyKey)) {
    const byId = await getSupabaseServer()
      .from("product_families")
      .select("id")
      .eq("id", familyKey)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (byId.data?.id) return byId.data.id;
  }

  const byCode = await getSupabaseServer()
    .from("product_families")
    .select("id")
    .eq("code", normalizeCode(familyKey))
    .eq("organization_id", organizationId)
    .maybeSingle();

  return byCode.data?.id || null;
}

export async function resolveVariantAttributeFamilyContext(params: {
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
    familyId,
    selectedBrandSlug,
  };
}

