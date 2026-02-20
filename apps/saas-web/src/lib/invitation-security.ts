export const INVITATION_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked"
  | "expired";

type InvitationState = {
  accepted_at?: string | null;
  declined_at?: string | null;
  revoked_at?: string | null;
  expires_at?: string | null;
};

export function isValidInvitationToken(token: string): boolean {
  return INVITATION_TOKEN_PATTERN.test(token);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function deriveInvitationStatus(
  invitation: InvitationState,
  now: Date = new Date()
): InvitationStatus {
  if (invitation.revoked_at) return "revoked";
  if (invitation.declined_at) return "declined";
  if (invitation.accepted_at) return "accepted";

  if (invitation.expires_at) {
    const expiresAt = new Date(invitation.expires_at);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt <= now) {
      return "expired";
    }
  }

  return "pending";
}

export function isInvitationActionable(
  invitation: InvitationState,
  now: Date = new Date()
): boolean {
  return deriveInvitationStatus(invitation, now) === "pending";
}

