import { NextRequest, NextResponse } from "next/server";
import {
  invalidateVariantAttributesCache,
  isCrossTenantWrite,
  resolveVariantAttributeFamilyContext,
  supabase,
} from "../_shared";

async function fetchVariantAttribute(params: {
  familyId: string;
  attributeId: string;
}) {
  return await supabase
    .from("product_family_variant_attributes")
    .select("id,product_family_id,product_field_id,sort_order,is_required")
    .eq("id", params.attributeId)
    .eq("product_family_id", params.familyId)
    .maybeSingle();
}

// PATCH /api/[tenant]/product-families/[familyId]/variant-attributes/[attributeId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string; attributeId: string }> }
) {
  try {
    const { tenant, familyId, attributeId } = await params;
    const familyContext = await resolveVariantAttributeFamilyContext({
      request,
      tenant,
      familyKey: familyId,
    });
    if (!familyContext.ok) {
      return familyContext.response;
    }

    if (isCrossTenantWrite(tenant, familyContext.selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const existing = await fetchVariantAttribute({
      familyId: familyContext.familyId,
      attributeId,
    });
    if (existing.error) {
      console.error("Error fetching variant attribute for patch:", existing.error);
      return NextResponse.json({ error: "Failed to fetch variant axis." }, { status: 500 });
    }
    if (!existing.data) {
      return NextResponse.json({ error: "Variant axis not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, any> = {};

    if (typeof body?.is_required === "boolean") {
      updates.is_required = body.is_required;
    }

    if (Number.isFinite(Number(body?.sort_order))) {
      updates.sort_order = Number(body.sort_order);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, data: existing.data });
    }

    const { data, error } = await supabase
      .from("product_family_variant_attributes")
      .update(updates)
      .eq("id", attributeId)
      .eq("product_family_id", familyContext.familyId)
      .select("id,product_family_id,product_field_id,sort_order,is_required")
      .single();

    if (error || !data) {
      console.error("Error updating variant attribute:", error);
      return NextResponse.json({ error: "Failed to update variant axis." }, { status: 500 });
    }

    invalidateVariantAttributesCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in variant attribute PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/product-families/[familyId]/variant-attributes/[attributeId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string; attributeId: string }> }
) {
  try {
    const { tenant, familyId, attributeId } = await params;
    const familyContext = await resolveVariantAttributeFamilyContext({
      request,
      tenant,
      familyKey: familyId,
    });
    if (!familyContext.ok) {
      return familyContext.response;
    }

    if (isCrossTenantWrite(tenant, familyContext.selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const existing = await fetchVariantAttribute({
      familyId: familyContext.familyId,
      attributeId,
    });
    if (existing.error) {
      console.error("Error fetching variant attribute for delete:", existing.error);
      return NextResponse.json({ error: "Failed to fetch variant axis." }, { status: 500 });
    }
    if (!existing.data) {
      return NextResponse.json({ error: "Variant axis not found." }, { status: 404 });
    }

    const { error } = await supabase
      .from("product_family_variant_attributes")
      .delete()
      .eq("id", attributeId)
      .eq("product_family_id", familyContext.familyId);

    if (error) {
      console.error("Error deleting variant attribute:", error);
      return NextResponse.json({ error: "Failed to remove variant axis." }, { status: 500 });
    }

    invalidateVariantAttributesCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in variant attribute DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

