import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess, setDatabaseUserContext } from "@/lib/user-context";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i;

function isCrossTenantWrite(params: { tenant: string; selectedBrandSlug: string | null }): boolean {
  const selected = (params.selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== params.tenant.trim().toLowerCase();
}

async function resolveProductByIdentifier(params: {
  organizationId: string;
  productIdOrSku: string;
}) {
  const normalizedIdentifier = (params.productIdOrSku || "").trim();
  const uuidPrefixMatch = normalizedIdentifier.match(UUID_PREFIX_PATTERN);
  const candidateId = uuidPrefixMatch?.[1] || normalizedIdentifier;

  if (UUID_PATTERN.test(candidateId)) {
    const byId = await supabase
      .from("products")
      .select("id,type,parent_id,has_variants,variant_count,organization_id")
      .eq("id", candidateId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (byId.data || byId.error) return byId;
  }

  return await supabase
    .from("products")
    .select("id,type,parent_id,has_variants,variant_count,organization_id")
    .ilike("sku", normalizedIdentifier)
    .eq("organization_id", params.organizationId)
    .limit(1)
    .maybeSingle();
}

// POST /api/[tenant]/products/[productId]/convert-to-parent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; productId: string }> }
) {
  try {
    const { tenant, productId } = await params;
    const selectedBrandSlug = new URL(request.url).searchParams.get("brand");

    if (isCrossTenantWrite({ tenant, selectedBrandSlug })) {
      return NextResponse.json(
        { error: "Cross-tenant writes are blocked in shared brand view." },
        { status: 403 }
      );
    }

    const { getUser, getOrganization } = getKindeServerSession();
    const user = await getUser();
    const kindeOrg = await getOrganization();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await hasOrganizationAccess(tenant, "collaborate");
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to update products in this organization." },
        { status: 403 }
      );
    }
    const organizationId = access.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "Organization context is missing." }, { status: 500 });
    }

    await setDatabaseUserContext(user.id, kindeOrg?.orgCode);

    const productResult = await resolveProductByIdentifier({
      organizationId,
      productIdOrSku: productId,
    });

    const product = productResult.data as
      | { id: string; type: string; parent_id: string | null; variant_count: number | null; has_variants: boolean | null }
      | null;

    if (productResult.error || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (product.type === "variant") {
      return NextResponse.json(
        { error: "Variant products cannot be converted to parent products." },
        { status: 400 }
      );
    }

    if (product.type === "parent") {
      return NextResponse.json({
        success: true,
        data: product,
      });
    }

    const variantCount = Number(product.variant_count || 0);
    const { data: updated, error: updateError } = await supabase
      .from("products")
      .update({
        type: "parent",
        parent_id: null,
        has_variants: variantCount > 0,
        last_modified_by: user.id,
      })
      .eq("id", product.id)
      .eq("organization_id", organizationId)
      .select("id,type,parent_id,has_variants,variant_count")
      .single();

    if (updateError || !updated) {
      console.error("Error converting product to parent:", updateError);
      return NextResponse.json({ error: "Failed to convert product to parent" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Error in convert-to-parent POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
