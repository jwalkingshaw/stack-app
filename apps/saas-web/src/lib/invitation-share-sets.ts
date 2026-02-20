type SupabaseLike = any;

type ResultOk<T> = { ok: true; data: T };
type ResultErr = { ok: false; status: number; error: string };

export function normalizeShareSetIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    out.add(trimmed);
  }
  return Array.from(out);
}

function isMissingFoundationError(error: any): boolean {
  if (!error) return false;
  if (error?.code === "42P01" || error?.code === "PGRST205") return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("share_sets") ||
    message.includes("partner_share_set_grants") ||
    message.includes("invitation_share_set_assignments")
  );
}

function isMissingColumnError(error: any): boolean {
  if (!error) return false;
  if (error?.code === "42703") return true;
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column");
}

async function hasActiveBrandPartnerRelationship(params: {
  supabase: SupabaseLike;
  brandOrganizationId: string;
  partnerOrganizationId: string;
}): Promise<ResultOk<boolean> | ResultErr> {
  const { supabase, brandOrganizationId, partnerOrganizationId } = params;

  const current = await supabase
    .from("brand_partner_relationships")
    .select("id")
    .eq("brand_organization_id", brandOrganizationId)
    .eq("partner_organization_id", partnerOrganizationId)
    .eq("status", "active")
    .limit(1);

  if (!current.error) {
    return { ok: true, data: Boolean(current.data?.length) };
  }
  if (!isMissingColumnError(current.error)) {
    return { ok: false, status: 500, error: "Failed to verify partner relationship status" };
  }

  const legacy = await supabase
    .from("brand_partner_relationships")
    .select("id")
    .eq("brand_id", brandOrganizationId)
    .eq("partner_id", partnerOrganizationId)
    .eq("status", "active")
    .limit(1);

  if (legacy.error) {
    return { ok: false, status: 500, error: "Failed to verify partner relationship status" };
  }

  return { ok: true, data: Boolean(legacy.data?.length) };
}

export async function validateShareSetIdsForOrganization(params: {
  supabase: SupabaseLike;
  organizationId: string;
  shareSetIds: string[];
}): Promise<ResultOk<{ validatedIds: string[] }> | ResultErr> {
  const { supabase, organizationId, shareSetIds } = params;
  if (shareSetIds.length === 0) {
    return { ok: true, data: { validatedIds: [] } };
  }

  const { data, error } = await supabase
    .from("share_sets")
    .select("id")
    .eq("organization_id", organizationId)
    .in("id", shareSetIds);

  if (error) {
    if (isMissingFoundationError(error)) {
      return {
        ok: false,
        status: 503,
        error: "Share set foundation tables are unavailable. Apply database migrations first.",
      };
    }
    return { ok: false, status: 500, error: "Failed to validate selected sets" };
  }

  const found = new Set(
    ((data || []) as Array<{ id: string | null }>)
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id))
  );
  if (found.size !== shareSetIds.length) {
    return {
      ok: false,
      status: 400,
      error: "One or more selected sets are invalid for this organization",
    };
  }

  return { ok: true, data: { validatedIds: shareSetIds } };
}

export async function replaceInvitationShareSetAssignments(params: {
  supabase: SupabaseLike;
  organizationId: string;
  invitationId: string;
  shareSetIds: string[];
  createdBy: string | null;
}): Promise<ResultOk<{ assignedCount: number }> | ResultErr> {
  const { supabase, organizationId, invitationId, shareSetIds, createdBy } = params;

  const deleteResult = await supabase
    .from("invitation_share_set_assignments")
    .delete()
    .eq("organization_id", organizationId)
    .eq("invitation_id", invitationId);

  if (deleteResult.error) {
    if (isMissingFoundationError(deleteResult.error)) {
      return {
        ok: false,
        status: 503,
        error:
          "Invitation set assignment table is unavailable. Apply database migrations first.",
      };
    }
    return { ok: false, status: 500, error: "Failed to update invitation set assignments" };
  }

  if (shareSetIds.length === 0) {
    return { ok: true, data: { assignedCount: 0 } };
  }

  const rows = shareSetIds.map((shareSetId) => ({
    organization_id: organizationId,
    invitation_id: invitationId,
    share_set_id: shareSetId,
    created_by: createdBy,
    metadata: {},
  }));

  const insertResult = await supabase
    .from("invitation_share_set_assignments")
    .insert(rows);

  if (insertResult.error) {
    if (isMissingFoundationError(insertResult.error)) {
      return {
        ok: false,
        status: 503,
        error:
          "Invitation set assignment table is unavailable. Apply database migrations first.",
      };
    }
    return { ok: false, status: 500, error: "Failed to save invitation set assignments" };
  }

  return { ok: true, data: { assignedCount: shareSetIds.length } };
}

export async function loadInvitationShareSetAssignments(params: {
  supabase: SupabaseLike;
  organizationId: string;
  invitationId: string;
}): Promise<ResultOk<{ shareSetIds: string[]; foundationAvailable: boolean }> | ResultErr> {
  const { supabase, organizationId, invitationId } = params;
  const { data, error } = await supabase
    .from("invitation_share_set_assignments")
    .select("share_set_id")
    .eq("organization_id", organizationId)
    .eq("invitation_id", invitationId);

  if (error) {
    if (isMissingFoundationError(error)) {
      return { ok: true, data: { shareSetIds: [], foundationAvailable: false } };
    }
    return { ok: false, status: 500, error: "Failed to load invitation set assignments" };
  }

  const shareSetIds = Array.from(
    new Set(
      ((data || []) as Array<{ share_set_id: string | null }>)
        .map((row) => row.share_set_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  return { ok: true, data: { shareSetIds, foundationAvailable: true } };
}

export async function applyInvitationShareSetGrants(params: {
  supabase: SupabaseLike;
  organizationId: string;
  invitationId: string;
  partnerOrganizationId: string;
  accessLevel: "view" | "edit";
  grantedBy: string | null;
}): Promise<ResultOk<{ appliedCount: number; foundationAvailable: boolean }> | ResultErr> {
  const {
    supabase,
    organizationId,
    invitationId,
    partnerOrganizationId,
    accessLevel,
    grantedBy,
  } = params;

  const relationship = await hasActiveBrandPartnerRelationship({
    supabase,
    brandOrganizationId: organizationId,
    partnerOrganizationId,
  });
  if (!relationship.ok) {
    return relationship;
  }
  if (!relationship.data) {
    return {
      ok: false,
      status: 403,
      error: "Partner organization is not actively related to this brand.",
    };
  }

  const snapshot = await loadInvitationShareSetAssignments({
    supabase,
    organizationId,
    invitationId,
  });
  if (!snapshot.ok) {
    return snapshot;
  }

  const { shareSetIds, foundationAvailable } = snapshot.data;
  if (!foundationAvailable || shareSetIds.length === 0) {
    return { ok: true, data: { appliedCount: 0, foundationAvailable } };
  }

  let appliedCount = 0;
  for (const shareSetId of shareSetIds) {
    const existing = await supabase
      .from("partner_share_set_grants")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("partner_organization_id", partnerOrganizationId)
      .eq("share_set_id", shareSetId)
      .eq("status", "active")
      .maybeSingle();

    if (existing.error) {
      if (isMissingFoundationError(existing.error)) {
        return { ok: true, data: { appliedCount, foundationAvailable: false } };
      }
      return { ok: false, status: 500, error: "Failed to resolve existing set grants" };
    }

    if (existing.data?.id) {
      const updateResult = await supabase
        .from("partner_share_set_grants")
        .update({
          access_level: accessLevel,
          granted_by: grantedBy,
          metadata: { source: "invitation", invitation_id: invitationId },
        })
        .eq("id", existing.data.id)
        .eq("organization_id", organizationId)
        .eq("status", "active");

      if (updateResult.error) {
        return { ok: false, status: 500, error: "Failed to update partner set grant" };
      }
      appliedCount += 1;
      continue;
    }

    const insertResult = await supabase
      .from("partner_share_set_grants")
      .insert({
        organization_id: organizationId,
        partner_organization_id: partnerOrganizationId,
        share_set_id: shareSetId,
        access_level: accessLevel,
        status: "active",
        granted_by: grantedBy,
        metadata: { source: "invitation", invitation_id: invitationId },
      });

    if (insertResult.error) {
      if (insertResult.error.code === "23505") {
        // Race-safe fallback: treat as applied if another request inserted first.
        appliedCount += 1;
        continue;
      }
      return { ok: false, status: 500, error: "Failed to create partner set grant" };
    }

    appliedCount += 1;
  }

  return { ok: true, data: { appliedCount, foundationAvailable: true } };
}
