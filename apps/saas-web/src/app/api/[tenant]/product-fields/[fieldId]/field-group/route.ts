import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

function parseSortOrder(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 1;
}

function asFieldGroupId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// PUT /api/[tenant]/product-fields/[fieldId]/field-group
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; fieldId: string }> }
) {
  try {
    const { tenant, fieldId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    if (isCrossTenantWrite(tenant, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const organizationId = contextResult.context.targetOrganization.id;
    const body = await request.json();
    const fieldGroupId = asFieldGroupId(body?.field_group_id ?? body?.fieldGroupId);
    const sortOrder = parseSortOrder(body?.sort_order ?? body?.sortOrder);

    const { data: fieldRecord, error: fieldError } = await supabase
      .from("product_fields")
      .select("id")
      .eq("id", fieldId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (fieldError) {
      console.error("Error validating product field:", fieldError);
      return NextResponse.json({ error: "Failed to validate attribute." }, { status: 500 });
    }

    if (!fieldRecord) {
      return NextResponse.json({ error: "Attribute not found." }, { status: 404 });
    }

    if (fieldGroupId) {
      const { data: groupRecord, error: groupError } = await supabase
        .from("field_groups")
        .select("id")
        .eq("id", fieldGroupId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (groupError) {
        console.error("Error validating field group:", groupError);
        return NextResponse.json({ error: "Failed to validate field group." }, { status: 500 });
      }

      if (!groupRecord) {
        return NextResponse.json({ error: "Field group not found." }, { status: 404 });
      }
    }

    const { error: deleteError } = await supabase
      .from("product_field_group_assignments")
      .delete()
      .eq("product_field_id", fieldId);

    if (deleteError) {
      console.error("Error clearing field assignments:", deleteError);
      return NextResponse.json({ error: "Failed to update field group assignment." }, { status: 500 });
    }

    let assignmentData: Record<string, unknown> | null = null;
    if (fieldGroupId) {
      const { data, error: assignmentError } = await supabase
        .from("product_field_group_assignments")
        .insert({
          product_field_id: fieldId,
          field_group_id: fieldGroupId,
          sort_order: sortOrder,
        })
        .select("id,field_group_id,product_field_id,sort_order")
        .single();

      if (assignmentError) {
        console.error("Error creating field assignment:", assignmentError);
        return NextResponse.json({ error: "Failed to assign attribute group." }, { status: 500 });
      }

      assignmentData = data;
    }

    return NextResponse.json({
      success: true,
      data: {
        product_field_id: fieldId,
        field_group_id: fieldGroupId,
        assignment: assignmentData,
      },
    });
  } catch (error) {
    console.error("Error in product field group PUT:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
