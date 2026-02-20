import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTenantAccessDecision } from "./tenant-access-decision";

test("allows when membership is verified", () => {
  const result = evaluateTenantAccessDecision({
    sessionOrgCode: "org_a",
    organizationKindeOrgId: "org_b",
    hasMembership: true,
  });

  assert.equal(result.allow, true);
  if (result.allow) {
    assert.equal(result.reason, "membership_verified");
  }
});

test("denies when membership is missing with no org context", () => {
  const result = evaluateTenantAccessDecision({
    sessionOrgCode: null,
    organizationKindeOrgId: "org_b",
    hasMembership: false,
  });

  assert.equal(result.allow, false);
  if (!result.allow) {
    assert.equal(result.reason, "membership_missing");
  }
});

test("allows with no org context when membership exists", () => {
  const result = evaluateTenantAccessDecision({
    sessionOrgCode: null,
    organizationKindeOrgId: "org_b",
    hasMembership: true,
  });

  assert.equal(result.allow, true);
  if (result.allow) {
    assert.equal(result.reason, "membership_verified");
  }
});

test("denies when org context matches but membership is missing", () => {
  const result = evaluateTenantAccessDecision({
    sessionOrgCode: "org_b",
    organizationKindeOrgId: "org_b",
    hasMembership: false,
  });

  assert.equal(result.allow, false);
  if (!result.allow) {
    assert.equal(result.reason, "membership_missing");
  }
});

test("denies when tenant org unmapped and membership is missing", () => {
  const result = evaluateTenantAccessDecision({
    sessionOrgCode: "org_b",
    organizationKindeOrgId: null,
    hasMembership: false,
  });

  assert.equal(result.allow, false);
  if (!result.allow) {
    assert.equal(result.reason, "membership_missing");
  }
});
