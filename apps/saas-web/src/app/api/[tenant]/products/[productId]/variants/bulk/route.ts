import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess, setDatabaseUserContext } from "@/lib/user-context";
import {
  getOrganizationBillingLimits,
  getOrganizationUsageSnapshot,
  isBillableSkuRecord,
} from "@/lib/billing-policy";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;

const ALLOWED_STATUS = new Set([
  "Draft",
  "Enrichment",
  "Review",
  "Active",
  "Discontinued",
  "Archived",
]);

function isCrossTenantWrite(params: { tenant: string; selectedBrandSlug: string | null }): boolean {
  const selected = (params.selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== params.tenant.trim().toLowerCase();
}

function normalizeBarcodeInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateBarcode(barcode: string | null): string | null {
  if (!barcode) return null;
  if (![8, 12, 13, 14].includes(barcode.length) || !/^\d+$/.test(barcode)) {
    return "Barcode must be 8, 12, 13, or 14 digits.";
  }
  return null;
}

function normalizeVariantAttributes(input: unknown): Record<string, any> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(input as Record<string, any>).map(([key, value]) => [key, value])
  );
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
  parent_id: string | null;
  scin: string | null;
  status: string | null;
};

// POST /api/[tenant]/products/[productId]/variants/bulk
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite({ tenant, selectedBrandSlug })) {
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
        { error: "Access denied. You do not have permission to update products in this organization." },
        { status: 403 }
      );
    }
    const organizationId = access.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "Organization context is missing." }, { status: 500 });
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const body = await request.json().catch(() => ({}));
    const variants = Array.isArray(body?.variants) ? body.variants : [];
    if (variants.length === 0) {
      return NextResponse.json({ error: "variants must be a non-empty array." }, { status: 400 });
    }

    const parentLookup = await resolveProductByIdentifier({
      organizationId,
      productIdOrSku: productId,
    });
    let parent = (parentLookup.data as ParentProduct | null) || null;

    if (parentLookup.error || !parent) {
      return NextResponse.json({ error: "Parent product not found" }, { status: 404 });
    }

    // If a variant identifier is passed, use its parent product.
    if (parent.type === "variant" && parent.parent_id) {
      const { data: parentRow, error: parentError } = await supabase
        .from("products")
        .select("id,type,parent_id,family_id,product_name,sku")
        .eq("id", parent.parent_id)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (parentError || !parentRow) {
        return NextResponse.json({ error: "Parent product not found" }, { status: 404 });
      }

      parent = parentRow as ParentProduct;
    }

    // Promote standalone to parent before creating variants.
    if (parent.type === "standalone") {
      const { data: promoted, error: promoteError } = await supabase
        .from("products")
        .update({
          type: "parent",
          parent_id: null,
          last_modified_by: user.id,
        })
        .eq("id", parent.id)
        .eq("organization_id", organizationId)
        .select("id,type,parent_id,family_id,product_name,sku")
        .single();

      if (promoteError || !promoted) {
        console.error("Error promoting standalone product:", promoteError);
        return NextResponse.json({ error: "Failed to convert product to parent." }, { status: 500 });
      }

      parent = promoted as ParentProduct;
    }

    const { data: existingVariants, error: existingError } = await supabase
      .from("products")
      .select("id,parent_id,scin,status")
      .eq("organization_id", organizationId)
      .eq("parent_id", parent.id)
      .eq("type", "variant");

    if (existingError) {
      console.error("Error fetching existing variants:", existingError);
      return NextResponse.json({ error: "Failed to load existing variants." }, { status: 500 });
    }

    const existingByScin = new Map<string, ExistingVariant>();
    (existingVariants || []).forEach((variant) => {
      if (variant.scin) {
        existingByScin.set(String(variant.scin).toUpperCase(), variant as ExistingVariant);
      }
    });

    const [{ limits }, usage] = await Promise.all([
      getOrganizationBillingLimits(organizationId),
      getOrganizationUsageSnapshot(organizationId),
    ]);
    const activeSkuLimit = limits.activeSkuCount;
    let projectedActiveSkuCount = usage.activeSkuCount;

    const created: any[] = [];
    const updated: any[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let index = 0; index < variants.length; index += 1) {
      const row = variants[index] || {};
      const status = typeof row.status === "string" && ALLOWED_STATUS.has(row.status)
        ? row.status
        : "Draft";

      const variantAttributes = normalizeVariantAttributes(
        row.variant_attribute_values ?? row.variant_attributes ?? row.variant_axis
      );

      const axisValues = Object.values(variantAttributes)
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);

      const fallbackName = `${parent.product_name || parent.sku || "Variant"} ${axisValues.join(" ")}`.trim();
      const productName =
        typeof row.product_name === "string" && row.product_name.trim().length > 0
          ? row.product_name.trim()
          : fallbackName;

      const sku =
        typeof row.sku === "string" && row.sku.trim().length > 0
          ? row.sku.trim()
          : null;

      const barcode = normalizeBarcodeInput(row.barcode) ?? normalizeBarcodeInput(row.upc);
      const barcodeError = validateBarcode(barcode);
      if (barcodeError) {
        errors.push({ index, error: barcodeError });
        continue;
      }

      if (status === "Active" && !sku) {
        errors.push({ index, error: "Active variants must include a SKU." });
        continue;
      }

      const scinInput =
        typeof row.scin === "string" && row.scin.trim().length > 0
          ? row.scin.trim().toUpperCase()
          : null;

      const payload: Record<string, any> = {
        product_name: productName,
        sku,
        barcode,
        family_id: parent.family_id || null,
        status,
        variant_attributes: variantAttributes,
        variant_axis: variantAttributes,
        last_modified_by: user.id,
      };

      const existingVariant = scinInput ? existingByScin.get(scinInput) : null;
      if (existingVariant) {
        const existingIsBillable = isBillableSkuRecord({
          type: "variant",
          status: existingVariant.status,
        });
        const nextIsBillable = isBillableSkuRecord({ type: "variant", status });
        let projectedDeltaApplied = 0;

        if (!existingIsBillable && nextIsBillable) {
          if (
            activeSkuLimit < Number.MAX_SAFE_INTEGER &&
            projectedActiveSkuCount + 1 > activeSkuLimit
          ) {
            errors.push({
              index,
              error: `Active SKU limit reached (${projectedActiveSkuCount}/${activeSkuLimit}). Upgrade your plan or purchase an add-on.`,
            });
            continue;
          }
          projectedActiveSkuCount += 1;
          projectedDeltaApplied = 1;
        } else if (existingIsBillable && !nextIsBillable) {
          projectedActiveSkuCount = Math.max(0, projectedActiveSkuCount - 1);
          projectedDeltaApplied = -1;
        }

        const { data: nextVariant, error: updateError } = await supabase
          .from("products")
          .update(payload)
          .eq("id", existingVariant.id)
          .eq("organization_id", organizationId)
          .eq("parent_id", parent.id)
          .eq("type", "variant")
          .select("id,scin,sku,product_name,status,parent_id,type,variant_attributes,variant_axis")
          .single();

        if (updateError || !nextVariant) {
          if (projectedDeltaApplied !== 0) {
            projectedActiveSkuCount = Math.max(0, projectedActiveSkuCount - projectedDeltaApplied);
          }
          errors.push({ index, error: updateError?.message || "Failed to update variant." });
          continue;
        }

        updated.push(nextVariant);
        continue;
      }

      const insertPayload: Record<string, any> = {
        organization_id: organizationId,
        type: "variant",
        parent_id: parent.id,
        created_by: user.id,
        ...payload,
      };

      if (scinInput) {
        insertPayload.scin = scinInput;
      }

      let consumedActiveSlot = false;
      if (isBillableSkuRecord({ type: "variant", status })) {
        if (
          activeSkuLimit < Number.MAX_SAFE_INTEGER &&
          projectedActiveSkuCount + 1 > activeSkuLimit
        ) {
          errors.push({
            index,
            error: `Active SKU limit reached (${projectedActiveSkuCount}/${activeSkuLimit}). Upgrade your plan or purchase an add-on.`,
          });
          continue;
        }
        projectedActiveSkuCount += 1;
        consumedActiveSlot = true;
      }

      const { data: insertedVariant, error: insertError } = await supabase
        .from("products")
        .insert(insertPayload)
        .select("id,scin,sku,product_name,status,parent_id,type,variant_attributes,variant_axis")
        .single();

      if (insertError || !insertedVariant) {
        if (consumedActiveSlot) {
          projectedActiveSkuCount = Math.max(0, projectedActiveSkuCount - 1);
        }
        if (insertError?.code === "23505") {
          errors.push({ index, error: "Variant conflicts with an existing unique identifier (SCIN/SKU/barcode)." });
        } else {
          errors.push({ index, error: insertError?.message || "Failed to create variant." });
        }
        continue;
      }

      created.push(insertedVariant);
    }

    if (created.length === 0 && updated.length === 0 && errors.length > 0) {
      return NextResponse.json(
        { error: "Failed to create variants.", details: errors },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        parentId: parent.id,
        created,
        updated,
        errors,
      },
    });
  } catch (error) {
    console.error("Error in variants bulk POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
