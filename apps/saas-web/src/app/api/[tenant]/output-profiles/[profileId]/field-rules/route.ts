import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function verifyProfileOwnership(organizationId: string, profileId: string) {
  const { data, error } = await supabase
    .from("output_channel_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("organization_id", organizationId)
    .single();
  return !error && !!data;
}

// GET /api/[tenant]/output-profiles/[profileId]/field-rules
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; profileId: string }> }
) {
  const { tenant, profileId } = await params;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.targetOrganization.id;

    const owned = await verifyProfileOwnership(organizationId, profileId);
    if (!owned) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { data: rules, error } = await supabase
      .from("output_profile_field_rules")
      .select("id, field_code, is_required, max_length, notes, created_at")
      .eq("profile_id", profileId)
      .order("field_code", { ascending: true });

    if (error) {
      console.error("Error fetching field rules:", error);
      return NextResponse.json({ error: "Failed to fetch field rules" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: rules ?? [] });
  } catch (err) {
    console.error("Unexpected error in GET /field-rules:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/[tenant]/output-profiles/[profileId]/field-rules
// Upserts one or more field rules for the profile
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; profileId: string }> }
) {
  const { tenant, profileId } = await params;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.tenantOrganization.id;

    const owned = await verifyProfileOwnership(organizationId, profileId);
    if (!owned) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Accept either a single rule or an array
    const rulesInput = Array.isArray(body.rules)
      ? body.rules
      : body.field_code
      ? [body]
      : [];

    type RuleInput = {
      field_code?: unknown;
      is_required?: unknown;
      max_length?: unknown;
      notes?: unknown;
    };

    const normalized = (rulesInput as RuleInput[])
      .map((r) => ({
        field_code: normalizeToken(r.field_code)?.toLowerCase(),
        is_required: typeof r.is_required === "boolean" ? r.is_required : true,
        max_length:
          typeof r.max_length === "number" && r.max_length > 0
            ? Math.floor(r.max_length)
            : null,
        notes: normalizeToken(r.notes),
      }))
      .filter((r) => !!r.field_code);

    if (normalized.length === 0) {
      return NextResponse.json({ error: "No valid field rules provided" }, { status: 400 });
    }

    const rows = normalized.map((r) => ({
      profile_id: profileId,
      field_code: r.field_code!,
      is_required: r.is_required,
      max_length: r.max_length,
      notes: r.notes,
    }));

    const { data: upserted, error } = await supabase
      .from("output_profile_field_rules")
      .upsert(rows, { onConflict: "profile_id,field_code" })
      .select();

    if (error) {
      console.error("Error upserting field rules:", error);
      return NextResponse.json({ error: "Failed to save field rules" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: upserted });
  } catch (err) {
    console.error("Unexpected error in POST /field-rules:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/[tenant]/output-profiles/[profileId]/field-rules?field_code=title
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; profileId: string }> }
) {
  const { tenant, profileId } = await params;

  try {
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: null,
    });
    if (!contextResult.ok) return contextResult.response;
    const organizationId = contextResult.context.tenantOrganization.id;

    const owned = await verifyProfileOwnership(organizationId, profileId);
    if (!owned) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const fieldCode = normalizeToken(
      request.nextUrl.searchParams.get("field_code")
    )?.toLowerCase();

    if (!fieldCode) {
      return NextResponse.json({ error: "field_code query param required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("output_profile_field_rules")
      .delete()
      .eq("profile_id", profileId)
      .eq("field_code", fieldCode);

    if (error) {
      console.error("Error deleting field rule:", error);
      return NextResponse.json({ error: "Failed to delete field rule" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error in DELETE /field-rules:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
