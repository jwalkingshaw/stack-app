import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess, setDatabaseUserContext } from "@/lib/user-context";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;
const MAX_AXIS_VALUES_PER_AXIS = 40;
const MAX_TOTAL_COMBINATIONS = 1000;

function isCrossTenantWrite(params: { tenant: string; selectedBrandSlug: string | null }): boolean {
  const selected = (params.selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== params.tenant.trim().toLowerCase();
}

function normalizeAxisValues(rawValues: unknown): string[] {
  if (!Array.isArray(rawValues)) return [];

  const unique = new Set<string>();
  for (const value of rawValues) {
    const normalized = String(value ?? "").trim();
    if (normalized.length > 0) unique.add(normalized);
  }

  return Array.from(unique);
}

function normalizeAxes(input: unknown): Record<string, string[]> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const normalized: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    const values = normalizeAxisValues(value);
    if (values.length > 0) {
      normalized[normalizedKey] = values.slice(0, MAX_AXIS_VALUES_PER_AXIS);
    }
  }

  return normalized;
}

function computeCombinationCount(axes: Record<string, string[]>): number {
  const keys = Object.keys(axes);
  if (keys.length === 0) return 0;

  return keys.reduce((acc, key) => acc * Math.max(axes[key]?.length || 0, 1), 1);
}

function buildCombinations(axes: Record<string, string[]>): Array<Record<string, string>> {
  const axisKeys = Object.keys(axes);
  if (axisKeys.length === 0) return [];

  const output: Array<Record<string, string>> = [];
  const walk = (index: number, current: Record<string, string>) => {
    if (index >= axisKeys.length) {
      output.push({ ...current });
      return;
    }

    const axisKey = axisKeys[index];
    const values = axes[axisKey] || [];
    for (const value of values) {
      current[axisKey] = value;
      walk(index + 1, current);
    }
  };

  walk(0, {});
  return output;
}

function buildAttributeKey(attributes: Record<string, any>): string {
  return Object.keys(attributes)
    .sort()
    .map((key) => `${key.toLowerCase()}=${String(attributes[key] ?? "").trim().toLowerCase()}`)
    .join("|");
}

function sanitizeSkuPart(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
}

function buildSuggestedSku(baseSku: string | null, attributes: Record<string, string>): string | null {
  const normalizedBase = typeof baseSku === "string" ? sanitizeSkuPart(baseSku) : "";
  const suffix = Object.values(attributes)
    .map((value) => sanitizeSkuPart(String(value)))
    .filter(Boolean)
    .join("-");

  if (!normalizedBase && !suffix) return null;
  const combined = [normalizedBase, suffix].filter(Boolean).join("-");
  return combined.slice(0, 128) || null;
}

function generatePreviewScin(usedScins: Set<string>): string {
  let attempts = 0;
  while (attempts < 16) {
    const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    if (!usedScins.has(candidate)) {
      usedScins.add(candidate);
      return candidate;
    }
    attempts += 1;
  }

  const fallback = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  usedScins.add(fallback);
  return fallback;
}

async function resolveProductByIdentifier(params: {
  organizationId: string;
  productIdOrSku: string;
}) {
  const normalizedIdentifier = (params.productIdOrSku || "").trim();
  const uuidPrefixMatch = normalizedIdentifier.match(UUID_PREFIX_PATTERN);
  const candidateId = uuidPrefixMatch?.[1] || normalizedIdentifier;

  if (UUID_PATTERN.test(candidateId)) {
    const byId = await supabase
      .from("products")
      .select("id,type,parent_id,family_id,product_name,sku")
      .eq("id", candidateId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (byId.data || byId.error) return byId;
  }

  return await supabase
    .from("products")
    .select("id,type,parent_id,family_id,product_name,sku")
    .ilike("sku", normalizedIdentifier)
    .eq("organization_id", params.organizationId)
    .limit(1)
    .maybeSingle();
}

type ParentProduct = {
  id: string;
  type: "parent" | "variant" | "standalone";
  parent_id: string | null;
  family_id: string | null;
  product_name: string | null;
  sku: string | null;
};

type ExistingVariant = {
  id: string;
  scin: string;
  sku: string | null;
  product_name: string | null;
  status: string | null;
  variant_attributes: Record<string, any> | null;
  variant_axis: Record<string, any> | null;
};

async function resolveParentProduct(params: {
  organizationId: string;
  productIdOrSku: string;
}): Promise<ParentProduct | null> {
  const baseResult = await resolveProductByIdentifier(params);
  let product = (baseResult.data as ParentProduct | null) || null;

  if (baseResult.error || !product) {
    return null;
  }

  if (product.type === "variant" && product.parent_id) {
    const { data: parentProduct, error: parentError } = await supabase
      .from("products")
      .select("id,type,parent_id,family_id,product_name,sku")
      .eq("id", product.parent_id)
      .eq("organization_id", params.organizationId)
      .maybeSingle();

    if (parentError || !parentProduct) return null;
    product = parentProduct as ParentProduct;
  }

  return product;
}

async function requireWriteAccess(request: NextRequest, tenant: string) {
  const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

  if (isCrossTenantWrite({ tenant, selectedBrandSlug })) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      ),
    };
  }

  const { getUser, getOrganization } = getKindeServerSession();
  const user = await getUser();
  const kindeOrg = await getOrganization();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const access = await hasOrganizationAccess(tenant, "collaborate");
  if (!access.hasAccess) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Access denied. You do not have permission to update products in this organization." },
        { status: 403 }
      ),
    };
  }
  const organizationId = access.organizationId;
  if (!organizationId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Organization context is missing." }, { status: 500 }),
    };
  }

  await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

  return {
    ok: true as const,
    user,
    access,
    organizationId,
  };
}

// POST /api/[tenant]/products/[productId]/variants/matrix
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const writeAccess = await requireWriteAccess(request, tenant);
    if (!writeAccess.ok) {
      return writeAccess.response;
    }

    const body = await request.json().catch(() => ({}));
    const axes = normalizeAxes(body?.axes);
    const axisKeys = Object.keys(axes);
    if (axisKeys.length === 0) {
      return NextResponse.json(
        { error: "axes must include at least one axis with one or more values." },
        { status: 400 }
      );
    }

    const totalCombinations = computeCombinationCount(axes);
    if (totalCombinations <= 0) {
      return NextResponse.json(
        { error: "No variant combinations were generated from the selected axes." },
        { status: 400 }
      );
    }

    if (totalCombinations > MAX_TOTAL_COMBINATIONS) {
      return NextResponse.json(
        {
          error: `Variant matrix is too large (${totalCombinations} combinations). Limit is ${MAX_TOTAL_COMBINATIONS}.`,
        },
        { status: 422 }
      );
    }

    const parent = await resolveParentProduct({
      organizationId: writeAccess.organizationId,
      productIdOrSku: productId,
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent product not found" }, { status: 404 });
    }

    const baseName =
      typeof body?.baseName === "string" && body.baseName.trim().length > 0
        ? body.baseName.trim()
        : parent.product_name || parent.sku || "Variant";

    const { data: existingVariants, error: existingError } = await supabase
      .from("products")
      .select("id,scin,sku,product_name,status,variant_attributes,variant_axis")
      .eq("organization_id", writeAccess.organizationId)
      .eq("parent_id", parent.id)
      .eq("type", "variant");

    if (existingError) {
      console.error("Error fetching existing variants for matrix:", existingError);
      return NextResponse.json({ error: "Failed to fetch existing variants." }, { status: 500 });
    }

    const existingByAttributes = new Map<string, ExistingVariant>();
    const usedScins = new Set<string>();
    (existingVariants || []).forEach((variant) => {
      if (typeof variant.scin === "string" && variant.scin.trim().length > 0) {
        usedScins.add(variant.scin.trim().toUpperCase());
      }

      const attrs =
        (variant.variant_attributes as Record<string, any> | null) ||
        (variant.variant_axis as Record<string, any> | null) ||
        {};
      const key = buildAttributeKey(attrs);
      if (key && !existingByAttributes.has(key)) {
        existingByAttributes.set(key, variant as ExistingVariant);
      }
    });

    const combinations = buildCombinations(axes);
    const rows = combinations.map((attributes) => {
      const key = buildAttributeKey(attributes);
      const existing = key ? existingByAttributes.get(key) : null;
      const values = Object.values(attributes).map((value) => String(value));
      const suggestedName = `${baseName} ${values.join(" ")}`.trim();
      const suggestedSku = buildSuggestedSku(parent.sku || null, attributes);

      if (existing) {
        return {
          id: existing.id,
          scin: existing.scin,
          attributes,
          status: existing.status || "Draft",
          suggestedName: existing.product_name || suggestedName,
          suggestedSku: existing.sku || suggestedSku,
          isExisting: true,
        };
      }

      return {
        scin: generatePreviewScin(usedScins),
        attributes,
        status: "Draft",
        suggestedName,
        suggestedSku,
        isExisting: false,
      };
    });

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        parentId: parent.id,
        total: rows.length,
        existing: rows.filter((row) => row.isExisting).length,
        new: rows.filter((row) => !row.isExisting).length,
      },
    });
  } catch (error) {
    console.error("Error in variants matrix POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/products/[productId]/variants/matrix
// Stateless matrix previews do not create temporary rows, so cleanup is a safe no-op.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant } = await params;
    const writeAccess = await requireWriteAccess(request, tenant);
    if (!writeAccess.ok) {
      return writeAccess.response;
    }

    const body = await request.json().catch(() => ({}));
    const scins = Array.isArray(body?.scins)
      ? body.scins.map((value: unknown) => String(value || "").trim()).filter(Boolean)
      : [];

    return NextResponse.json({
      success: true,
      data: {
        deletedCount: 0,
        ignoredScins: scins.length,
      },
    });
  } catch (error) {
    console.error("Error in variants matrix DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
