import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeCode(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function resolveFamilyId(params: {
  organizationId: string;
  familyKey: string;
}): Promise<string | null> {
  const { organizationId, familyKey } = params;

  if (UUID_PATTERN.test(familyKey)) {
    const byId = await supabase
      .from("product_families")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", familyKey)
      .maybeSingle();

    if (byId.data?.id) return byId.data.id;
  }

  const byCode = await supabase
    .from("product_families")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", normalizeCode(familyKey))
    .maybeSingle();

  return byCode.data?.id || null;
}

// GET /api/[tenant]/product-families/[familyId]/history
// TODO: Wire to real audit log table once product family history persistence is implemented.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; familyId: string }> }
) {
  try {
    const { tenant, familyId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug,
    });
    if (!contextResult.ok) {
      return contextResult.response;
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const resolvedFamilyId = await resolveFamilyId({
      organizationId: targetOrganizationId,
      familyKey: familyId,
    });

    if (!resolvedFamilyId) {
      return NextResponse.json({ error: "Product family not found." }, { status: 404 });
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error("Error in product family history GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

