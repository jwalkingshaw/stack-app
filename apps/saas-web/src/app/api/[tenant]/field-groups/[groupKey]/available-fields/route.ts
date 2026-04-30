import { getSupabaseServer } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import {
  resolveTargetOrganization,
  
} from "../../_shared";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveFieldGroupIdByKey(
  organizationId: string,
  groupKey: string
) {
  const key = groupKey.trim();

  if (UUID_PATTERN.test(key)) {
    const byId = await getSupabaseServer()
      .from("field_groups")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", key)
      .maybeSingle();

    if (byId.data || byId.error) {
      return byId;
    }
  }

  return getSupabaseServer()
    .from("field_groups")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", key)
    .maybeSingle();
}

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

    const groupResult = await resolveFieldGroupIdByKey(context.targetOrganizationId, groupKey);

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
    const groupId = (groupResult.data as { id: string }).id;

    const { data: assignedRows, error: assignedError } = await getSupabaseServer()
      .from("product_field_group_assignments")
      .select("product_field_id")
      .eq("field_group_id", groupId);

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

    const { data: allFields, error: fieldsError } = await getSupabaseServer()
      .from("product_fields")
      .select("id, name, code, description, field_type")
      .eq("organization_id", context.targetOrganizationId)
      .order("name", { ascending: true });

    if (fieldsError) {
      console.error("Error fetching organization fields:", fieldsError);
      return NextResponse.json(
        { error: "Failed to fetch attributes" },
        { status: 500 }
      );
    }

    const available = (allFields || [])
      .filter((field) => !assignedFieldIds.has(field.id))
      .map((field) => ({
        id: field.id,
        name: field.name || field.code || "Untitled field",
        code: field.code || "",
        description: field.description,
        field_type: field.field_type,
        type: field.field_type,
      }));

    return NextResponse.json(available);
  } catch (error) {
    console.error("Error in available fields GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
