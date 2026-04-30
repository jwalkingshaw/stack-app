import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  resolveTenantBrandViewContext,
  resolvePartnerEffectiveOutputProfileId,
} from "@/lib/partner-brand-view";
import { resolvePartnerEntitlements } from "@/lib/partner-entitlements";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /api/[tenant]/view/[scope]/catalog/summary
// Returns destination context + readiness counts for the partner context bar.
// Query params: marketId=uuid (optional — scopes to a specific market)
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; scope: string }> }
) {
  try {
    const { tenant, scope } = await params;

    const url = new URL(request.url);
    const marketId = url.searchParams.get("marketId") ?? null;
    const destinationProfileId =
      url.searchParams.get("destinationProfileId") ??
      url.searchParams.get("channelId") ??
      null;
    const localeId = url.searchParams.get("localeId") ?? null;
    const destinationId = url.searchParams.get("destinationId") ?? null;

    // Resolve partner auth + brand access
    const contextResult = await resolveTenantBrandViewContext({
      request,
      tenantSlug: tenant,
      selectedBrandSlug: scope,
    });
    if (!contextResult.ok) return contextResult.response;

    const { context } = contextResult;
    if (context.mode !== "partner_brand") {
      return NextResponse.json({
        success: true,
        data: { channel: null, destination_profile: null, market: null, readiness: null },
      });
    }

    const brandOrganizationId = context.targetOrganization.id;
    const partnerOrganizationId = context.tenantOrganization.id;

    // Resolve entitlements + profile in parallel
    const [primaryProfileResult, entitlementResult, marketResult] = await Promise.all([
      resolvePartnerEffectiveOutputProfileId({
        brandOrganizationId,
        partnerOrganizationId,
        marketId,
        destinationId,
      }),
      resolvePartnerEntitlements({
        brandOrganizationId,
        partnerOrganizationId,
        scope: {
          marketId,
          destinationProfileId,
          localeId,
          destinationId,
        },
      }),
      // Get market name if marketId provided
      (async () => {
        if (!marketId || !UUID_RE.test(marketId)) return null;
        const { data } = await supabase
          .from("markets")
          .select("id,name,code")
          .eq("id", marketId)
          .eq("organization_id", brandOrganizationId)
          .maybeSingle();
        return (data as { id: string; name: string; code: string } | null) ?? null;
      })(),
    ]);

    if (destinationId && !entitlementResult.requestedDestinationGranted) {
      return NextResponse.json({
        success: true,
        data: {
          channel: null,
          destination_profile: null,
          market: marketResult,
          readiness: null,
          productCount: 0,
          selected_destination_granted: false,
          selected_destination_published: false,
          destinations: [],
          portal_publishes: [],
        },
      });
    }

    if (!entitlementResult.productFoundationAvailable) {
      return NextResponse.json({ error: "Sharing not available for this brand." }, { status: 404 });
    }

    const productIds = entitlementResult.productIds;
    const destinationViews = entitlementResult.destinations;
    const profileId =
      destinationId && destinationViews.some((view) => view.id === destinationId)
        ? destinationId
        : primaryProfileResult;
    const recentPortalPublishes = entitlementResult.portalPublishes
      .map((publish) => {
        const destination = destinationViews.find((view) => view.id === publish.outputProfileId);
        return {
          id: publish.id,
          output_profile_id: publish.outputProfileId,
          destination_name: destination?.name ?? "Destination",
          published_at: publish.publishedAt,
          publish_state: publish.publishState,
        };
      })
      .slice(0, 4);

    // Resolve destination profile name from profile
    let destinationProfile: { id: string; name: string; profile_type: string } | null = null;
    if (profileId) {
      const { data: profileData } = await supabase
        .from("output_channel_profiles" as never)
        .select("id, name, profile_type")
        .eq("id", profileId)
        .eq("organization_id", brandOrganizationId)
        .maybeSingle();
      if (profileData) {
        destinationProfile = profileData as { id: string; name: string; profile_type: string };
      }
    }

    // Readiness: count products with all required fields populated
    let readiness: { total: number; ready: number } | null = null;
    if (productIds.length > 0 && profileId) {
      readiness = await computeReadiness({
        organizationId: brandOrganizationId,
        profileId,
        productIds,
        marketId,
        destinationProfileId,
        localeId,
        destinationId,
      });
    } else if (productIds.length > 0) {
      readiness = { total: productIds.length, ready: 0 };
    }

    return NextResponse.json({
      success: true,
      data: {
        channel: destinationProfile,
        destination_profile: destinationProfile,
        market: marketResult,
        readiness,
        productCount: productIds.length,
        selected_destination_granted: entitlementResult.requestedDestinationGranted,
        selected_destination_published: entitlementResult.requestedDestinationPublished,
        destinations: destinationViews.map((view) => ({
          id: view.id,
          name: view.name,
          code: view.code,
          profile_type: view.profileType,
          access_level: view.accessLevel,
        })),
        portal_publishes: recentPortalPublishes,
      },
    });
  } catch (err) {
    console.error("Unexpected error in GET catalog/summary:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Inline readiness scoring (avoids HTTP self-call to readiness/batch)
// ---------------------------------------------------------------------------

async function computeReadiness(params: {
  organizationId: string;
  profileId: string;
  productIds: string[];
  marketId: string | null;
  destinationProfileId: string | null;
  localeId: string | null;
  destinationId: string | null;
}): Promise<{ total: number; ready: number }> {
  const {
    organizationId,
    profileId,
    productIds,
    marketId,
    destinationProfileId,
    localeId,
    destinationId,
  } = params;

  // Load required field rules
  const { data: rulesRaw } = await supabase
    .from("output_profile_field_rules")
    .select("field_code")
    .eq("profile_id", profileId)
    .eq("is_required", true);

  const requiredCodes = ((rulesRaw ?? []) as Array<{ field_code: string }>).map((r) => r.field_code);
  if (requiredCodes.length === 0) {
    return { total: productIds.length, ready: productIds.length };
  }

  // Resolve field codes → IDs
  const { data: fieldDefsRaw } = await supabase
    .from("product_fields")
    .select("id, code")
    .eq("organization_id", organizationId)
    .in("code", requiredCodes);

  const fieldDefs = (fieldDefsRaw ?? []) as Array<{ id: string; code: string }>;
  if (fieldDefs.length === 0) {
    return { total: productIds.length, ready: 0 };
  }

  const fieldIds = fieldDefs.map((f) => f.id);
  const totalRequired = fieldDefs.length;

  // Load field values (global values only — no scope filtering for summary)
  const { data: valuesRaw } = await supabase
    .from("product_field_values")
    .select(
      "product_id, product_field_id, value_text, value_number, value_boolean, value_json, market_id, channel_id, locale_id, destination_id"
    )
    .eq("organization_id", organizationId)
    .in("product_id", productIds)
    .in("product_field_id", fieldIds);

  // Count populated required fields per product
  const matchesScope = (rowScope: string | null, selectedScope: string | null): boolean => {
    if (rowScope === null) return true;
    if (!selectedScope) return false;
    return rowScope === selectedScope;
  };

  const completedByProduct = new Map<string, Set<string>>();
  for (const row of (valuesRaw ?? []) as Array<{
    product_id: string;
    product_field_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_json: unknown;
    market_id: string | null;
    channel_id: string | null;
    locale_id: string | null;
    destination_id: string | null;
  }>) {
    if (!matchesScope(row.market_id, marketId)) continue;
    if (!matchesScope(row.channel_id, destinationProfileId)) continue;
    if (!matchesScope(row.locale_id, localeId)) continue;
    if (!matchesScope(row.destination_id, destinationId)) continue;
    const val = row.value_text ?? row.value_number ?? row.value_boolean ?? row.value_json;
    const present = val !== null && val !== undefined && (typeof val !== "string" || val.trim().length > 0);
    if (!present) continue;
    if (!completedByProduct.has(row.product_id)) completedByProduct.set(row.product_id, new Set());
    completedByProduct.get(row.product_id)!.add(row.product_field_id);
  }

  let ready = 0;
  for (const productId of productIds) {
    const completed = completedByProduct.get(productId)?.size ?? 0;
    if (completed >= totalRequired) ready += 1;
  }

  return { total: productIds.length, ready };
}
