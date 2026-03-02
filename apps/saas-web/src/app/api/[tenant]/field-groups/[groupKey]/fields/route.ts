import { NextRequest, NextResponse } from "next/server";
import {
  CORE_SYSTEM_FIELD_CODES,
  isCrossTenantWrite,
  isLockedFieldGroupCode,
  normalizeAssignment,
  resolveFieldGroupByKey,
  resolveTargetOrganization,
  supabase,
} from "../../_shared";

function parseSortOrder(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// GET /api/[tenant]/field-groups/[groupKey]/fields
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; groupKey: string }> }
) {
  try {
    const { tenant, groupKey } = await params;
    const context = await resolveTargetOrganization(request, tenant);
    if (!context.ok) {
      return context.response;
    }

    const groupResult = await resolveFieldGroupByKey(
      context.targetOrganizationId,
      groupKey
    );

    if (groupResult.error) {
      console.error("Error fetching field group for assignments:", groupResult.error);
      return NextResponse.json(
        { error: "Failed to fetch field group" },
        { status: 500 }
      );
    }

    if (!groupResult.data) {
      return NextResponse.json({ error: "Field group not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("product_field_group_assignments")
      .select("*, product_fields!product_field_id(*)")
      .eq("field_group_id", groupResult.data.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching field group assignments:", error);
      return NextResponse.json(
        { error: "Failed to fetch field group assignments" },
        { status: 500 }
      );
    }

    const normalized = (data || [])
      .map((assignment) => normalizeAssignment(assignment))
      .filter(
        (assignment): assignment is any =>
          Boolean(assignment) &&
          (assignment.product_fields?.organization_id ===
            context.targetOrganizationId ||
            !assignment.product_fields?.organization_id)
      );

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Error in field group fields GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/field-groups/[groupKey]/fields
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; groupKey: string }> }
) {
  try {
    const { tenant, groupKey } = await params;
    const context = await resolveTargetOrganization(request, tenant);
    if (!context.ok) {
      return context.response;
    }

    if (isCrossTenantWrite(tenant, context.selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are not allowed in brand view." },
        { status: 403 }
      );
    }

    const groupResult = await resolveFieldGroupByKey(
      context.targetOrganizationId,
      groupKey
    );
    if (groupResult.error) {
      console.error("Error fetching field group for assignment create:", groupResult.error);
      return NextResponse.json(
        { error: "Failed to fetch field group" },
        { status: 500 }
      );
    }
    if (!groupResult.data) {
      return NextResponse.json({ error: "Field group not found" }, { status: 404 });
    }

    const body = await request.json();
    const productFieldId =
      typeof body?.product_field_id === "string" ? body.product_field_id : "";
    if (!productFieldId) {
      return NextResponse.json(
        { error: "product_field_id is required." },
        { status: 400 }
      );
    }

    const { data: fieldRecord, error: fieldError } = await supabase
      .from("product_fields")
      .select("id")
      .eq("id", productFieldId)
      .eq("organization_id", context.targetOrganizationId)
      .maybeSingle();

    if (fieldError) {
      console.error("Error validating product field:", fieldError);
      return NextResponse.json(
        { error: "Failed to validate product field" },
        { status: 500 }
      );
    }

    if (!fieldRecord) {
      return NextResponse.json(
        { error: "Attribute not found for this organization." },
        { status: 404 }
      );
    }

    const sortOrder = parseSortOrder(body?.sort_order, 1);
    const { data, error } = await supabase
      .from("product_field_group_assignments")
      .upsert(
        {
          field_group_id: groupResult.data.id,
          product_field_id: productFieldId,
          sort_order: sortOrder,
        },
        {
          onConflict: "product_field_id,field_group_id",
          ignoreDuplicates: false,
        }
      )
      .select("*, product_fields!product_field_id(*)")
      .single();

    if (error) {
      console.error("Error creating field group assignment:", error);
      return NextResponse.json(
        { error: "Failed to add attribute to field group" },
        { status: 500 }
      );
    }

    return NextResponse.json(normalizeAssignment(data), { status: 201 });
  } catch (error) {
    console.error("Error in field group fields POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/field-groups/[groupKey]/fields?fieldId=<field-id>
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; groupKey: string }> }
) {
  try {
    const { tenant, groupKey } = await params;
    const context = await resolveTargetOrganization(request, tenant);
    if (!context.ok) {
      return context.response;
    }

    if (isCrossTenantWrite(tenant, context.selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are not allowed in brand view." },
        { status: 403 }
      );
    }

    const groupResult = await resolveFieldGroupByKey(
      context.targetOrganizationId,
      groupKey
    );
    if (groupResult.error) {
      console.error("Error fetching field group for assignment delete:", groupResult.error);
      return NextResponse.json(
        { error: "Failed to fetch field group" },
        { status: 500 }
      );
    }
    if (!groupResult.data) {
      return NextResponse.json({ error: "Field group not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const fieldId = url.searchParams.get("fieldId");
    const assignmentId = url.searchParams.get("assignmentId");

    if (!fieldId && !assignmentId) {
      return NextResponse.json(
        { error: "fieldId or assignmentId query param is required." },
        { status: 400 }
      );
    }

    if (isLockedFieldGroupCode(groupResult.data.code)) {
      let targetFieldCode: string | null = null;

      if (assignmentId) {
        const { data: assignmentRecord, error: assignmentError } = await supabase
          .from("product_field_group_assignments")
          .select("product_fields!product_field_id(code)")
          .eq("id", assignmentId)
          .eq("field_group_id", groupResult.data.id)
          .maybeSingle();

        if (assignmentError) {
          console.error("Error resolving assignment for delete guard:", assignmentError);
          return NextResponse.json(
            { error: "Failed to validate attribute assignment" },
            { status: 500 }
          );
        }

        const relation = assignmentRecord?.product_fields;
        if (Array.isArray(relation)) {
          targetFieldCode =
            relation.length > 0 && typeof relation[0]?.code === "string"
              ? relation[0].code
              : null;
        } else {
          targetFieldCode =
            relation && typeof (relation as any).code === "string"
              ? (relation as any).code
              : null;
        }
      } else if (fieldId) {
        const { data: fieldRecord, error: fieldError } = await supabase
          .from("product_fields")
          .select("code")
          .eq("id", fieldId)
          .eq("organization_id", context.targetOrganizationId)
          .maybeSingle();

        if (fieldError) {
          console.error("Error resolving field for delete guard:", fieldError);
          return NextResponse.json(
            { error: "Failed to validate attribute assignment" },
            { status: 500 }
          );
        }

        targetFieldCode = typeof fieldRecord?.code === "string" ? fieldRecord.code : null;
      }

      if (targetFieldCode && CORE_SYSTEM_FIELD_CODES.has(targetFieldCode)) {
        return NextResponse.json(
          { error: "Core system attributes cannot be removed from this locked field group." },
          { status: 403 }
        );
      }
    }

    let deleteQuery = supabase
      .from("product_field_group_assignments")
      .delete()
      .eq("field_group_id", groupResult.data.id);

    if (assignmentId) {
      deleteQuery = deleteQuery.eq("id", assignmentId);
    } else if (fieldId) {
      deleteQuery = deleteQuery.eq("product_field_id", fieldId);
    }

    const { error } = await deleteQuery;
    if (error) {
      console.error("Error deleting field group assignment:", error);
      return NextResponse.json(
        { error: "Failed to remove attribute from field group" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in field group fields DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
