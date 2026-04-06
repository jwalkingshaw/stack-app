import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPartnerSettingsRedirectPath,
  isPartnerSettingsPathAllowed,
} from "./partner-settings-access";

test("allows partner settings root path", () => {
  assert.equal(isPartnerSettingsPathAllowed("/acme/settings", "acme"), true);
  assert.equal(isPartnerSettingsPathAllowed("/acme/settings/", "acme"), true);
});

test("allows partner billing path and billing query params", () => {
  assert.equal(isPartnerSettingsPathAllowed("/acme/settings/billing", "acme"), true);
  assert.equal(
    isPartnerSettingsPathAllowed(
      "/acme/settings/billing?source=partner_signup&next=upgrade",
      "acme"
    ),
    true
  );
});

test("rejects disallowed partner settings subpaths", () => {
  assert.equal(isPartnerSettingsPathAllowed("/acme/settings/markets", "acme"), false);
  assert.equal(isPartnerSettingsPathAllowed("/acme/settings/team", "acme"), false);
  assert.equal(isPartnerSettingsPathAllowed("/acme/settings/localization", "acme"), false);
});

test("builds partner restricted settings redirect", () => {
  assert.equal(
    buildPartnerSettingsRedirectPath("acme"),
    "/acme/settings/billing?source=partner_restricted"
  );
});
