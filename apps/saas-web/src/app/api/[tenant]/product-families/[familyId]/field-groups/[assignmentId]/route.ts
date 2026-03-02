import { NextRequest, NextResponse } from "next/server";
import {
  invalidateFamilyFieldGroupsCache,
  isCrossTenantWrite,
  resolveFamilyContext,
  supabase,
} from "../_shared";

function parseHiddenFields(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0);
}

async function fetchAssignment(params: {
  assignmentId: string;
  familyId: string;
}) {
  return await supabase
    .from("product_family_field_groups")
    .select("id,product_family_id,field_group_id,hidden_fields,sort_order")
    .eq("id", params.assignmentId)
    .eq("product_family_id", params.familyId)
    .maybeSingle();
}

// PATCH /api/[tenant]/product-families/[familyId]/field-groups/[assignmentId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string; assignmentId: string }> }
) {
  try {
    const { tenant, familyId, assignmentId } = await params;
    const familyContext = await resolveFamilyContext({
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

    const existing = await fetchAssignment({
      assignmentId,
      familyId: familyContext.familyId,
    });
    if (existing.error) {
      console.error("Error looking up family field group assignment:", existing.error);
      return NextResponse.json({ error: "Failed to fetch assignment." }, { status: 500 });
    }
    if (!existing.data) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, any> = {};

    if (Object.prototype.hasOwnProperty.call(body || {}, "hidden_fields")) {
      updates.hidden_fields = parseHiddenFields(body?.hidden_fields);
    }

    if (Number.isFinite(Number(body?.sort_order))) {
      updates.sort_order = Number(body.sort_order);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(existing.data);
    }

    const { data, error } = await supabase
      .from("product_family_field_groups")
      .update(updates)
      .eq("id", assignmentId)
      .eq("product_family_id", familyContext.familyId)
      .select("id,product_family_id,field_group_id,hidden_fields,sort_order")
      .single();

    if (error || !data) {
      console.error("Error updating family field group assignment:", error);
      return NextResponse.json({ error: "Failed to update assignment." }, { status: 500 });
    }

    invalidateFamilyFieldGroupsCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });

    return NextResponse.json({
      ...data,
      hidden_fields: parseHiddenFields((data as any).hidden_fields),
    });
  } catch (error) {
    console.error("Error in family field groups assignment PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/product-families/[familyId]/field-groups/[assignmentId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string; assignmentId: string }> }
) {
  try {
    const { tenant, familyId, assignmentId } = await params;
    const familyContext = await resolveFamilyContext({
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

    const existing = await fetchAssignment({
      assignmentId,
      familyId: familyContext.familyId,
    });
    if (existing.error) {
      console.error("Error looking up family field group assignment for delete:", existing.error);
      return NextResponse.json({ error: "Failed to fetch assignment." }, { status: 500 });
    }
    if (!existing.data) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const { error } = await supabase
      .from("product_family_field_groups")
      .delete()
      .eq("id", assignmentId)
      .eq("product_family_id", familyContext.familyId);
    if (error) {
      console.error("Error deleting family field group assignment:", error);
      return NextResponse.json({ error: "Failed to remove assignment." }, { status: 500 });
    }

    invalidateFamilyFieldGroupsCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in family field groups assignment DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

