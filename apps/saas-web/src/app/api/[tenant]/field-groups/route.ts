import { NextRequest, NextResponse } from "next/server";
import {
  FIELD_GROUP_WITH_ASSIGNMENTS_SELECT,
  isCrossTenantWrite,
  normalizeFieldGroup,
  resolveTargetOrganization,
  supabase,
} from "./_shared";

function normalizeCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// GET /api/[tenant]/field-groups
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const context = await resolveTargetOrganization(request, tenant);
    if (!context.ok) {
      return context.response;
    }

    const { data, error } = await supabase
      .from("field_groups")
      .select(FIELD_GROUP_WITH_ASSIGNMENTS_SELECT)
      .eq("organization_id", context.targetOrganizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching field groups:", error);
      return NextResponse.json(
        { error: "Failed to fetch field groups" },
        { status: 500 }
      );
    }

    const normalized = (data || [])
      .map((group) => normalizeFieldGroup(group))
      .filter((group): group is any => Boolean(group));

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("Error in field groups GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/field-groups
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
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

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const codeInput = typeof body?.code === "string" ? body.code : "";
    const code = normalizeCode(codeInput);
    const description =
      typeof body?.description === "string" ? body.description.trim() : null;
    const sortOrder = Number.isFinite(Number(body?.sort_order))
      ? Number(body.sort_order)
      : 1;

    if (!name || !code) {
      return NextResponse.json(
        { error: "Name and code are required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("field_groups")
      .insert({
        organization_id: context.targetOrganizationId,
        name,
        code,
        description,
        sort_order: sortOrder,
        is_active: true,
      })
      .select(FIELD_GROUP_WITH_ASSIGNMENTS_SELECT)
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A field group with this code already exists." },
          { status: 409 }
        );
      }

      console.error("Error creating field group:", error);
      return NextResponse.json(
        { error: "Failed to create field group" },
        { status: 500 }
      );
    }

    return NextResponse.json(normalizeFieldGroup(data), { status: 201 });
  } catch (error) {
    console.error("Error in field groups POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
