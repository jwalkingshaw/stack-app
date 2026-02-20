export type TenantAccessDecisionInput = {
  sessionOrgCode?: string | null;
  organizationKindeOrgId?: string | null;
  hasMembership?: boolean;
};

export type TenantAccessDecision =
  | { allow: true; reason: "membership_verified" }
  | { allow: false; reason: "membership_missing" };

export function evaluateTenantAccessDecision(
  input: TenantAccessDecisionInput
): TenantAccessDecision {
  if (input.hasMembership) {
    return { allow: true, reason: "membership_verified" };
  }

  return { allow: false, reason: "membership_missing" };
}
