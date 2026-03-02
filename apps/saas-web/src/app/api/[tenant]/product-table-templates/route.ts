import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TEMPLATE_SELECT = `
  id,
  organization_id,
  code,
  version,
  kind,
  label,
  description,
  region,
  regulator,
  locale,
  definition,
  metadata,
  is_active,
  created_at,
  updated_at
`;

function isMissingTableError(error: any): boolean {
  return error?.code === "42P01";
}

// GET /api/[tenant]/product-table-templates
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
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

    const { data, error } = await supabase
      .from("product_table_templates")
      .select(TEMPLATE_SELECT)
      .eq("is_active", true)
      .or(`organization_id.eq.${targetOrganizationId},organization_id.is.null`)
      .order("label", { ascending: true });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json([]);
      }
      console.error("Error fetching product table templates:", error);
      return NextResponse.json({ error: "Failed to fetch product table templates" }, { status: 500 });
    }

    const templates = (data || []).map((template: any) => ({
      id: template.id,
      organization_id: template.organization_id,
      code: template.code,
      version: template.version,
      kind: template.kind,
      label: template.label,
      description: template.description,
      region: template.region,
      regulator: template.regulator,
      locale: template.locale,
      definition: template.definition || {},
      metadata: template.metadata || {},
      is_active: template.is_active ?? true,
      created_at: template.created_at,
      updated_at: template.updated_at,
    }));

    return NextResponse.json(templates);
  } catch (error) {
    console.error("Error in product table templates GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

