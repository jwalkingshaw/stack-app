import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeAndValidateLocaleCode } from "@/lib/locale-code";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UNIQUE_VIOLATION_ERROR = "23505";

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

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
      .from("locales")
      .select("id,code,name,is_active")
      .eq("organization_id", targetOrganizationId)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching locales:", error);
      return NextResponse.json({ error: "Failed to fetch locales" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Error in locales GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
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

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const normalizedCode = normalizeAndValidateLocaleCode(body?.code);

    if (!name) {
      return NextResponse.json({ error: "Locale name is required." }, { status: 400 });
    }

    if (!normalizedCode) {
      return NextResponse.json(
        { error: "Locale code is invalid. Use a BCP-47 style code like en, en-US, fr-CA, or zh-Hant." },
        { status: 400 }
      );
    }

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const { data, error } = await supabase
      .from("locales")
      .insert({
        organization_id: targetOrganizationId,
        code: normalizedCode,
        name,
        is_active: true,
      })
      .select("id,code,name,is_active")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "A language with this code already exists." },
          { status: 409 }
        );
      }
      console.error("Error creating locale:", error);
      return NextResponse.json({ error: "Failed to create locale" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error in locales POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
