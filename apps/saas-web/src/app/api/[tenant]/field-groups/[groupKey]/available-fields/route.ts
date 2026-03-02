import { NextRequest, NextResponse } from "next/server";
import {
  normalizeField,
  resolveFieldGroupByKey,
  resolveTargetOrganization,
  supabase,
} from "../../_shared";

// GET /api/[tenant]/field-groups/[groupKey]/available-fields
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
      console.error("Error fetching field group for available fields:", groupResult.error);
      return NextResponse.json(
        { error: "Failed to fetch field group" },
        { status: 500 }
      );
    }

    if (!groupResult.data) {
      return NextResponse.json({ error: "Field group not found" }, { status: 404 });
    }

    const { data: assignedRows, error: assignedError } = await supabase
      .from("product_field_group_assignments")
      .select("product_field_id")
      .eq("field_group_id", groupResult.data.id);

    if (assignedError) {
      console.error("Error fetching assigned fields:", assignedError);
      return NextResponse.json(
        { error: "Failed to fetch assigned attributes" },
        { status: 500 }
      );
    }

    const assignedFieldIds = new Set(
      (assignedRows || [])
        .map((row) => row.product_field_id)
        .filter((id): id is string => typeof id === "string")
    );

    const { data: allFields, error: fieldsError } = await supabase
      .from("product_fields")
      .select("*")
      .eq("organization_id", context.targetOrganizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (fieldsError) {
      console.error("Error fetching organization fields:", fieldsError);
      return NextResponse.json(
        { error: "Failed to fetch attributes" },
        { status: 500 }
      );
    }

    const available = (allFields || [])
      .filter((field) => !assignedFieldIds.has(field.id))
      .map((field) => normalizeField(field))
      .filter((field): field is any => Boolean(field))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(available);
  } catch (error) {
    console.error("Error in available fields GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
