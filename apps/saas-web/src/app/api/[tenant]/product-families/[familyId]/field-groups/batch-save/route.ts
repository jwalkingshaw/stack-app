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

type BatchChange = {
  assignmentId: string;
  hiddenFields: string[];
};

async function parseBatchPayload(request: NextRequest): Promise<BatchChange[]> {
  const contentType = request.headers.get("content-type") || "";
  let body: any = null;

  if (contentType.includes("application/json")) {
    body = await request.json().catch(() => null);
  } else {
    const raw = await request.text();
    if (raw.trim().length === 0) return [];
    body = JSON.parse(raw);
  }

  const changes = Array.isArray(body?.changes) ? body.changes : [];
  return changes
    .map((change: any) => ({
      assignmentId:
        typeof change?.assignmentId === "string" ? change.assignmentId.trim() : "",
      hiddenFields: parseHiddenFields(change?.hiddenFields),
    }))
    .filter((change: BatchChange) => change.assignmentId.length > 0);
}

// POST /api/[tenant]/product-families/[familyId]/field-groups/batch-save
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string }> }
) {
  try {
    const { tenant, familyId } = await params;
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

    const changes = await parseBatchPayload(request);
    if (changes.length === 0) {
      return NextResponse.json({ success: true, data: { updated: 0 } });
    }

    const assignmentIds = changes.map((change) => change.assignmentId);
    const { data: existingAssignments, error: existingError } = await supabase
      .from("product_family_field_groups")
      .select("id")
      .eq("product_family_id", familyContext.familyId)
      .in("id", assignmentIds);
    if (existingError) {
      console.error("Error validating batch field-group assignments:", existingError);
      return NextResponse.json({ error: "Failed to validate assignments." }, { status: 500 });
    }

    const allowed = new Set((existingAssignments || []).map((row) => row.id));
    const filtered = changes.filter((change) => allowed.has(change.assignmentId));

    const results = await Promise.all(
      filtered.map(async (change) =>
        supabase
          .from("product_family_field_groups")
          .update({ hidden_fields: change.hiddenFields })
          .eq("id", change.assignmentId)
          .eq("product_family_id", familyContext.familyId)
      )
    );

    const failed = results.filter((result) => result.error);
    if (failed.length > 0) {
      console.error("Error saving one or more field-group assignment changes:", failed);
      return NextResponse.json({ error: "Failed to save some changes." }, { status: 500 });
    }

    invalidateFamilyFieldGroupsCache({
      organizationId: familyContext.organizationId,
      familyId: familyContext.familyId,
    });

    return NextResponse.json({
      success: true,
      data: {
        updated: filtered.length,
        ignored: changes.length - filtered.length,
      },
    });
  } catch (error) {
    console.error("Error in field-groups batch-save POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

