import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { resolveTenantBrandViewContext } from "@/lib/partner-brand-view";


const UNIQUE_VIOLATION_ERROR = "23505";
const MISSING_TABLE_ERROR = "42P01";

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
  { params }: { params: Promise<{ tenant: string; destinationId: string }> }
) {
  try {
    const { tenant, destinationId } = await params;
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
    const body = await request.json();
    const { data: existingDestination, error: existingDestinationError } = await getSupabaseServer()
      .from("channel_destinations")
      .select("id,channel_id,market_id")
      .eq("id", destinationId)
      .eq("organization_id", targetOrganizationId)
      .maybeSingle();

    if (existingDestinationError) {
      if (existingDestinationError.code === MISSING_TABLE_ERROR) {
        return NextResponse.json(
          { error: "Destinations are not available until migrations are applied." },
          { status: 409 }
        );
      }
      console.error("Error loading destination before update:", existingDestinationError);
      return NextResponse.json({ error: "Failed to update destination" }, { status: 500 });
    }

    if (!existingDestination) {
      return NextResponse.json({ error: "Destination not found." }, { status: 404 });
    }

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

    if (typeof body?.description === "string" || body?.description === null) {
      updatePayload.description =
        typeof body.description === "string" && body.description.trim().length > 0
          ? body.description.trim()
          : null;
    }

    if (typeof body?.sort_order !== "undefined") {
      if (!Number.isFinite(Number(body.sort_order))) {
        return NextResponse.json({ error: "sort_order must be a number." }, { status: 400 });
      }
      updatePayload.sort_order = Number(body.sort_order);
    }

    if (typeof body?.is_active === "boolean") {
      updatePayload.is_active = body.is_active;
    }

    const nextChannelId =
      typeof body?.channel_id !== "undefined"
        ? typeof body.channel_id === "string" && body.channel_id.trim().length > 0
          ? body.channel_id.trim()
          : null
        : existingDestination.channel_id;

    if (!nextChannelId) {
      return NextResponse.json({ error: "Destination requires a channel." }, { status: 400 });
    }

    const { data: channel, error: channelError } = await getSupabaseServer()
      .from("channels")
      .select("id")
      .eq("organization_id", targetOrganizationId)
      .eq("id", nextChannelId)
      .maybeSingle();

    if (channelError || !channel) {
      return NextResponse.json({ error: "Invalid channel selected." }, { status: 400 });
    }

    if (typeof body?.channel_id !== "undefined") {
      updatePayload.channel_id = nextChannelId;
    }

    if (typeof body?.market_id !== "undefined") {
      const marketId =
        typeof body.market_id === "string" && body.market_id.trim().length > 0
          ? body.market_id.trim()
          : null;

      if (marketId) {
        const { data: market, error: marketError } = await getSupabaseServer()
          .from("markets")
          .select("id")
          .eq("organization_id", targetOrganizationId)
          .eq("id", marketId)
          .maybeSingle();

        if (marketError || !market) {
          return NextResponse.json({ error: "Invalid market selected." }, { status: 400 });
        }
      }

      updatePayload.market_id = marketId;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const { data, error } = await getSupabaseServer()
      .from("channel_destinations")
      .update(updatePayload)
      .eq("id", destinationId)
      .eq("organization_id", targetOrganizationId)
      .select("id,code,name,description,is_active,channel_id,market_id,sort_order")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION_ERROR) {
        return NextResponse.json(
          { error: "A destination with this code already exists." },
          { status: 409 }
        );
      }
      if (error.code === MISSING_TABLE_ERROR) {
        return NextResponse.json(
          { error: "Destinations are not available until migrations are applied." },
          { status: 409 }
        );
      }

      console.error("Error updating destination:", error);
      return NextResponse.json({ error: "Failed to update destination" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in destination PUT:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

