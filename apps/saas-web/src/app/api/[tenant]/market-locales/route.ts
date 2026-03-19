import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isCrossTenantWrite(tenantSlug: string, selectedBrandSlug: string | null): boolean {
  const selected = (selectedBrandSlug || "").trim().toLowerCase();
  if (!selected) return false;
  return selected !== tenantSlug.trim().toLowerCase();
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    const { data: markets, error: marketsError } = await supabase
      .from("markets")
      .select("id")
      .eq("organization_id", targetOrganizationId);

    if (marketsError) {
      console.error("Error fetching markets for market-locales:", marketsError);
      return NextResponse.json({ error: "Failed to fetch market locales" }, { status: 500 });
    }

    const marketIds = (markets || []).map((row) => row.id).filter(Boolean);
    if (marketIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data, error } = await supabase
      .from("market_locales")
      .select("id,market_id,locale_id,is_active")
      .in("market_id", marketIds);

    if (error) {
      console.error("Error fetching market locales:", error);
      return NextResponse.json({ error: "Failed to fetch market locales" }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Error in market-locales GET:", error);
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

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const body = await request.json().catch(() => ({}));
    const marketId = normalizeToken(body?.market_id ?? body?.marketId);
    const localeId = normalizeToken(body?.locale_id ?? body?.localeId);

    if (!marketId || !localeId) {
      return NextResponse.json(
        { error: "market_id and locale_id are required." },
        { status: 400 }
      );
    }

    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id,default_locale_id")
      .eq("organization_id", targetOrganizationId)
      .eq("id", marketId)
      .maybeSingle();

    if (marketError || !market) {
      return NextResponse.json({ error: "Invalid market selected." }, { status: 400 });
    }

    const { data: locale, error: localeError } = await supabase
      .from("locales")
      .select("id,is_active")
      .eq("organization_id", targetOrganizationId)
      .eq("id", localeId)
      .maybeSingle();

    if (localeError || !locale) {
      return NextResponse.json({ error: "Invalid language selected." }, { status: 400 });
    }

    if (!locale.is_active) {
      return NextResponse.json({ error: "Selected language is inactive." }, { status: 400 });
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("market_locales")
      .upsert(
        {
          market_id: marketId,
          locale_id: localeId,
          is_active: true,
        },
        { onConflict: "market_id,locale_id" }
      )
      .select("id,market_id,locale_id,is_active")
      .single();

    if (assignmentError) {
      console.error("Failed to assign locale to market:", assignmentError);
      return NextResponse.json({ error: "Failed to assign language to market." }, { status: 500 });
    }

    if (!market.default_locale_id) {
      const { error: defaultUpdateError } = await supabase
        .from("markets")
        .update({ default_locale_id: localeId })
        .eq("organization_id", targetOrganizationId)
        .eq("id", marketId);

      if (defaultUpdateError) {
        console.error("Failed to set default locale while assigning:", defaultUpdateError);
      }
    }

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    console.error("Error in market-locales POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
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

    const targetOrganizationId = contextResult.context.targetOrganization.id;
    const body = await request.json().catch(() => ({}));
    const marketId = normalizeToken(body?.market_id ?? body?.marketId);
    const localeId = normalizeToken(body?.locale_id ?? body?.localeId);
    const nextIsActive =
      typeof body?.is_active === "boolean"
        ? body.is_active
        : typeof body?.isActive === "boolean"
          ? body.isActive
          : null;

    if (!marketId || !localeId || typeof nextIsActive !== "boolean") {
      return NextResponse.json(
        { error: "market_id, locale_id, and is_active are required." },
        { status: 400 }
      );
    }

    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id,default_locale_id")
      .eq("organization_id", targetOrganizationId)
      .eq("id", marketId)
      .maybeSingle();

    if (marketError || !market) {
      return NextResponse.json({ error: "Invalid market selected." }, { status: 400 });
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("market_locales")
      .select("id,market_id,locale_id,is_active")
      .eq("market_id", marketId)
      .eq("locale_id", localeId)
      .maybeSingle();

    if (assignmentError) {
      console.error("Failed to load market locale assignment:", assignmentError);
      return NextResponse.json({ error: "Failed to update market language assignment." }, { status: 500 });
    }

    if (!assignment) {
      return NextResponse.json({ error: "Market language assignment not found." }, { status: 404 });
    }

    if (nextIsActive === assignment.is_active) {
      return NextResponse.json(assignment);
    }

    if (!nextIsActive) {
      const { data: activeAssignments, error: activeAssignmentsError } = await supabase
        .from("market_locales")
        .select("locale_id")
        .eq("market_id", marketId)
        .eq("is_active", true);

      if (activeAssignmentsError) {
        console.error("Failed to validate active market locales:", activeAssignmentsError);
        return NextResponse.json({ error: "Failed to update market language assignment." }, { status: 500 });
      }

      const activeRows = (activeAssignments || []) as Array<{ locale_id: string }>;
      if (activeRows.length <= 1) {
        return NextResponse.json(
          { error: "A market must keep at least one active language." },
          { status: 400 }
        );
      }

      if (market.default_locale_id === localeId) {
        const fallback = activeRows.find((row) => row.locale_id !== localeId) || null;
        const { error: clearDefaultError } = await supabase
          .from("markets")
          .update({ default_locale_id: fallback?.locale_id || null })
          .eq("organization_id", targetOrganizationId)
          .eq("id", marketId);

        if (clearDefaultError) {
          console.error("Failed to move default locale during unassign:", clearDefaultError);
          return NextResponse.json({ error: "Failed to update market language assignment." }, { status: 500 });
        }
      }
    }

    const { data: updatedAssignment, error: updateError } = await supabase
      .from("market_locales")
      .update({ is_active: nextIsActive })
      .eq("id", assignment.id)
      .select("id,market_id,locale_id,is_active")
      .single();

    if (updateError) {
      console.error("Failed to update market locale assignment:", updateError);
      return NextResponse.json({ error: "Failed to update market language assignment." }, { status: 500 });
    }

    return NextResponse.json(updatedAssignment);
  } catch (error) {
    console.error("Error in market-locales PATCH:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
