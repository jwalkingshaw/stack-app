import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDamAssetRecord, normalizeDamEnumValue } from "./dam-enums";

test("normalizes DAM enum aliases to canonical values", () => {
  assert.equal(normalizeDamEnumValue("complianceStatus", "Pending"), "pending");
  assert.equal(normalizeDamEnumValue("complianceStatus", "Under Review"), "under_review");
  assert.equal(normalizeDamEnumValue("brandLegalApproval", "Not Required"), "not_required");
  assert.equal(normalizeDamEnumValue("licenseOwnership", "Work for Hire"), "work_for_hire");
  assert.equal(normalizeDamEnumValue("licenseOwnership", "Rights-Managed"), "rights_managed");
  assert.equal(normalizeDamEnumValue("colorProfile", "Pantone / PMS"), "pms");
  assert.equal(normalizeDamEnumValue("printVsDigital", "Omni Channel"), "omnichannel");
  assert.equal(normalizeDamEnumValue("endorsementType", "Expert / practitioner"), "expert");
});

test("normalizes camelCase and snake_case DAM enum fields on asset records", () => {
  const asset = normalizeDamAssetRecord({
    complianceStatus: "Under Review",
    brand_legal_approval: "Approved",
    licenseOwnership: "UGC License",
    print_vs_digital: "Digital",
    wadaRiskLevel: "High",
  });

  assert.equal(asset.complianceStatus, "under_review");
  assert.equal(asset.brand_legal_approval, "approved");
  assert.equal(asset.licenseOwnership, "ugc_license");
  assert.equal(asset.print_vs_digital, "digital");
  assert.equal(asset.wadaRiskLevel, "high");
});
