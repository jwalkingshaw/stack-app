import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveInvitationStatus,
  isInvitationActionable,
  isValidInvitationToken,
  normalizeEmail,
} from "./invitation-security";

test("accepts valid UUID invitation token", () => {
  assert.equal(
    isValidInvitationToken("3fa85f64-5717-4562-b3fc-2c963f66afa6"),
    true
  );
});

test("rejects malformed invitation token", () => {
  assert.equal(isValidInvitationToken("not-a-token"), false);
  assert.equal(isValidInvitationToken("3fa85f64-5717-4562-b3fc"), false);
});

test("normalizes invitation emails safely", () => {
  assert.equal(normalizeEmail("  USER@Example.Com "), "user@example.com");
});

test("derives terminal invitation statuses", () => {
  assert.equal(
    deriveInvitationStatus({ revoked_at: "2026-02-25T12:00:00Z" }),
    "revoked"
  );
  assert.equal(
    deriveInvitationStatus({ declined_at: "2026-02-25T12:00:00Z" }),
    "declined"
  );
  assert.equal(
    deriveInvitationStatus({ accepted_at: "2026-02-25T12:00:00Z" }),
    "accepted"
  );
});

test("marks invitation expired when expires_at is in the past", () => {
  const now = new Date("2026-02-26T00:00:00Z");
  const status = deriveInvitationStatus(
    { expires_at: "2026-02-25T00:00:00Z" },
    now
  );
  assert.equal(status, "expired");
});

test("pending invitation is actionable, expired is not", () => {
  const now = new Date("2026-02-26T00:00:00Z");
  assert.equal(
    isInvitationActionable({ expires_at: "2026-02-27T00:00:00Z" }, now),
    true
  );
  assert.equal(
    isInvitationActionable({ expires_at: "2026-02-25T00:00:00Z" }, now),
    false
  );
  assert.equal(
    isInvitationActionable({ accepted_at: "2026-02-25T00:00:00Z" }, now),
    false
  );
});

