import { NextRequest, NextResponse } from "next/server";
import {
  isCrossTenantWrite,
  isLockedFieldGroupCode,
  normalizeFieldGroup,
  resolveFieldGroupByKey,
  resolveTargetOrganization,
  supabase,
} from "../_shared";

function normalizeCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// GET /api/[tenant]/field-groups/[groupKey]
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

    const { data, error } = await resolveFieldGroupByKey(
      context.targetOrganizationId,
      groupKey
    );

    if (error) {
      console.error("Error fetching field group:", error);
      return NextResponse.json(
        { error: "Failed to fetch field group" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Field group not found" }, { status: 404 });
    }

    return NextResponse.json(normalizeFieldGroup(data));
  } catch (error) {
    console.error("Error in field group GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/[tenant]/field-groups/[groupKey]
export async function PUT(
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

    const existing = await resolveFieldGroupByKey(
      context.targetOrganizationId,
      groupKey
    );

    if (existing.error) {
      console.error("Error looking up field group for update:", existing.error);
      return NextResponse.json(
        { error: "Failed to fetch field group" },
        { status: 500 }
      );
    }

    if (!existing.data) {
      return NextResponse.json({ error: "Field group not found" }, { status: 404 });
    }

    if (isLockedFieldGroupCode(existing.data.code)) {
      return NextResponse.json(
        { error: "This system group cannot be edited." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
      }
      updates.name = name;
    }

    if (typeof body?.code === "string") {
      const code = normalizeCode(body.code);
      if (!code) {
        return NextResponse.json({ error: "Code cannot be empty." }, { status: 400 });
      }
      updates.code = code;
    }

    if (typeof body?.description === "string") {
      updates.description = body.description.trim();
    }

    if (Number.isFinite(Number(body?.sort_order))) {
      updates.sort_order = Number(body.sort_order);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(normalizeFieldGroup(existing.data));
    }

    const { data, error } = await supabase
      .from("field_groups")
      .update(updates)
      .eq("id", existing.data.id)
      .eq("organization_id", context.targetOrganizationId)
      .select("*, product_field_group_assignments(*, product_fields!product_field_id(*))")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A field group with this code already exists." },
          { status: 409 }
        );
      }

      console.error("Error updating field group:", error);
      return NextResponse.json(
        { error: "Failed to update field group" },
        { status: 500 }
      );
    }

    return NextResponse.json(normalizeFieldGroup(data));
  } catch (error) {
    console.error("Error in field group PUT:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/field-groups/[groupKey]
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

    const existing = await resolveFieldGroupByKey(
      context.targetOrganizationId,
      groupKey
    );

    if (existing.error) {
      console.error("Error looking up field group for delete:", existing.error);
      return NextResponse.json(
        { error: "Failed to fetch field group" },
        { status: 500 }
      );
    }

    if (!existing.data) {
      return NextResponse.json({ error: "Field group not found" }, { status: 404 });
    }

    if (isLockedFieldGroupCode(existing.data.code)) {
      return NextResponse.json(
        { error: "This system group cannot be deleted." },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("field_groups")
      .delete()
      .eq("id", existing.data.id)
      .eq("organization_id", context.targetOrganizationId);

    if (error) {
      console.error("Error deleting field group:", error);
      return NextResponse.json(
        { error: "Failed to delete field group" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in field group DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
