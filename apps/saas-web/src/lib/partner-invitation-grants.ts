import { getSupabaseServer } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@stack-app/database";

import { applyInvitationShareSetGrants } from "@/lib/invitation-share-sets";
import {
  normalizeInvitePermissions,
  type InvitePermissionsSnapshot,
} from "@/lib/invite-permissions";
import { invalidatePartnerGrantCachesForBrand } from "@/lib/partner-brand-view";

type SupabaseLike = SupabaseClient<Database>;

type ResultOk<T> = { ok: true; data: T };
type ResultErr = { ok: false; status: number; error: string };

export type PartnerInvitationWorkspaceScope = {
  outputProfileIds: string[];
};

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.add(trimmed);
  }
  return Array.from(out);
}

export function extractPartnerInvitationWorkspaceScope(
  permissions: InvitePermissionsSnapshot | Record<string, unknown> | null | undefined
): PartnerInvitationWorkspaceScope {
  const normalized = normalizeInvitePermissions(permissions ?? {});
  return {
    outputProfileIds: uniqueStrings(normalized.scopes?.output_profile_ids),
  };
}

export async function applyPartnerInvitationWorkspaceGrants(params: {
  supabase: SupabaseLike;
  organizationId: string;
  invitationId: string;
  partnerOrganizationId: string;
  invitedBy: string | null;
  permissions: InvitePermissionsSnapshot | Record<string, unknown> | null | undefined;
}): Promise<
  ResultOk<{
    appliedProfileGrantCount: number;
    appliedMarketAssignmentCount: number;
    appliedShareSetGrantCount: number;
  }> | ResultErr
> {
  const { supabase, organizationId, invitationId, partnerOrganizationId, invitedBy, permissions } = params;
  const scope = extractPartnerInvitationWorkspaceScope(permissions);
  let appliedProfileGrantCount = 0;

  for (const outputProfileId of scope.outputProfileIds) {
    const { error } = await supabase
      .from("partner_contract_grants")
      .upsert(
        {
          organization_id: organizationId,
          partner_organization_id: partnerOrganizationId,
          output_profile_id: outputProfileId,
          access_level: "view",
          status: "active",
          metadata: {
            source: "invitation",
            invitation_id: invitationId,
          },
          created_by: invitedBy,
        },
        {
          onConflict: "organization_id,partner_organization_id,output_profile_id",
          ignoreDuplicates: false,
        }
      );

    if (error) {
      return {
        ok: false,
        status: 500,
        error: "Failed to grant published profile access for this partner invitation.",
      };
    }

    appliedProfileGrantCount += 1;
  }

  const shareSetGrantResult = await applyInvitationShareSetGrants({
    supabase: getSupabaseServer(),
    organizationId,
    invitationId,
    partnerOrganizationId,
    accessLevel: "view",
    grantedBy: invitedBy,
  });

  if (!shareSetGrantResult.ok) {
    return shareSetGrantResult;
  }

  invalidatePartnerGrantCachesForBrand(organizationId);

  return {
    ok: true,
    data: {
      appliedProfileGrantCount,
      appliedMarketAssignmentCount: 0,
      appliedShareSetGrantCount: shareSetGrantResult.data.appliedCount,
    },
  };
}
