import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { logSecurityEvent } from "@/lib/security-audit";
import { requireSharingManagerContext } from "../../../_shared";

/**
 * PATCH /api/[tenant]/sharing/sets/[setId]
 *
 * Updates mutable fields on a share set header.
 * Currently supports: output_profile_id (null to clear)
 *
 * Body: { output_profile_id?: string | null }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; setId: string }> }
) {
  try {
    const { tenant, setId } = await params;
    const access = await requireSharingManagerContext(request, tenant);
    if (!access.ok) return access.response;

    const { organization, userId } = access.context;

    // Verify set belongs to org
    const { data: set, error: setError } = await supabaseServer
      .from("share_sets")
      .select("id, name, module_key")
      .eq("id", setId)
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (setError) {
      console.error("PATCH share set: error fetching set:", setError);
      return NextResponse.json({ error: "Failed to resolve share set" }, { status: 500 });
    }
    if (!set) {
      return NextResponse.json({ error: "Share set not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    const updates: Record<string, unknown> = {};

    // output_profile_id — validate if provided (not null)
    if ("output_profile_id" in body) {
      const profileId = body.output_profile_id;
      if (profileId === null || profileId === "") {
        updates.output_profile_id = null;
      } else if (typeof profileId === "string") {
        // Verify the profile belongs to this org
        const { data: profile } = await supabaseServer
          .from("output_channel_profiles")
          .select("id")
          .eq("id", profileId)
          .eq("organization_id", organization.id)
          .maybeSingle();

        if (!profile) {
          return NextResponse.json({ error: "Output profile not found" }, { status: 404 });
        }
        updates.output_profile_id = profileId;
      } else {
        return NextResponse.json({ error: "output_profile_id must be a string or null" }, { status: 400 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabaseServer
      .from("share_sets")
      .update(updates)
      .eq("id", setId)
      .eq("organization_id", organization.id)
      .select("id, name, module_key, output_profile_id")
      .single();

    if (updateError) {
      console.error("PATCH share set: error updating:", updateError);
      return NextResponse.json({ error: "Failed to update share set" }, { status: 500 });
    }

    await logSecurityEvent(supabaseServer, {
      organizationId: organization.id,
      actorUserId: userId,
      action: "sharing.set.updated",
      resourceType: "share_set",
      resourceId: setId,
      userAgent: request.headers.get("user-agent"),
      metadata: { ...updates, set_name: set.name },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("Unexpected error in PATCH /sharing/sets/[setId]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
