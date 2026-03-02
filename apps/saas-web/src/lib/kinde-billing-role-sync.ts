import { kindeAPI } from "@/lib/kinde-management";

const BILLING_ADMIN_APP_ROLES = new Set(["owner", "admin"]);
const BILLING_ADMIN_ROLE_KEY = (process.env.KINDE_BILLING_ADMIN_ROLE_KEY || "org_billing_admin")
  .trim()
  .toLowerCase();

export async function syncKindeBillingRoleForMember(params: {
  kindeOrgId: string | null | undefined;
  kindeUserId: string | null | undefined;
  appRole: string | null | undefined;
  status?: string | null | undefined;
  context?: string;
}): Promise<{
  ok: boolean;
  skipped?: boolean;
  changed?: boolean;
  shouldHaveRole?: boolean;
  reason?: string;
}> {
  const kindeOrgId = String(params.kindeOrgId || "").trim();
  const kindeUserId = String(params.kindeUserId || "").trim();
  const appRole = String(params.appRole || "").trim().toLowerCase();
  const status = String(params.status || "active").trim().toLowerCase();
  const context = params.context || "unknown";

  if (!kindeOrgId || !kindeUserId) {
    return { ok: false, skipped: true, reason: "missing_kinde_identifiers" };
  }

  if (!BILLING_ADMIN_ROLE_KEY) {
    return { ok: false, skipped: true, reason: "missing_billing_role_key" };
  }

  const shouldHaveRole = status === "active" && BILLING_ADMIN_APP_ROLES.has(appRole);
  try {
    const syncResult = await kindeAPI.syncOrganizationUserRoleByKey({
      orgId: kindeOrgId,
      userId: kindeUserId,
      roleKey: BILLING_ADMIN_ROLE_KEY,
      shouldHaveRole,
    });
    return { ok: true, changed: syncResult.changed, shouldHaveRole };
  } catch (error) {
    console.warn(
      `[kinde-billing-role-sync] Failed to sync billing role in ${context} (org=${kindeOrgId}, user=${kindeUserId}, role=${appRole}, shouldHave=${shouldHaveRole}):`,
      error
    );
    return { ok: false, shouldHaveRole, reason: "sync_failed" };
  }
}
