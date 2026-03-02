import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UNIQUE_VIOLATION_ERROR = "23505";

function normalizeCode(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; channelId: string }> }
) {
  try {
    const { tenant, channelId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite(tenant, selectedBrandSlug)) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const body = await request.json();

    const updatePayload: Record<string, unknown> = {};

    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
      }
      updatePayload.name = name;
    }

    if (typeof body?.code === "string") {
      const code = normalizeCode(body.code);
      if (!code) {
        return NextResponse.json({ error: "Code cannot be empty." }, { status: 400 });
      }
      updatePayload.code = code;
    }

    if (typeof body?.is_active === "boolean") {
      updatePayload.is_active = body.is_active;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("channels")
      .update(updatePayload)
      .eq("id", channelId)
      .eq("organization_id", targetOrganizationId)
      .select("id,code,name,is_active")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "A channel with this code already exists." },
          { status: 409 }
        );
      }

      console.error("Error updating channel:", error);
      return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in channel PUT:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
