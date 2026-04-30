import test from "node:test";
import assert from "node:assert/strict";
import { blockPartnerBrandMutation } from "./partner-brand-mutation-guard";

test("returns 403 for partner-brand mutation attempts", async () => {
  const request = new Request("https://example.com/api/acme/markets", {
    method: "POST",
    headers: {
      "user-agent": "node-test",
    },
  });

  const response = await blockPartnerBrandMutation({
    request: request as never,
    context: {
      userId: "user_123",
      userEmail: "person@example.com",
      tenantOrganization: {
        id: "org_partner",
        slug: "partner-workspace",
        name: "Partner Workspace",
        organizationType: "partner",
      },
      targetOrganization: {
        id: "org_brand",
        slug: "brand-workspace",
        name: "Brand Workspace",
        organizationType: "brand",
      },
      selectedBrandSlug: "brand-workspace",
      mode: "partner_brand",
      brandMemberId: null,
    },
    action: "products.create",
    resourceType: "product",
  });

  assert.ok(response);
  assert.equal(response?.status, 403);
});

test("returns null for tenant-mode mutations", async () => {
  const request = new Request("https://example.com/api/acme/markets", {
    method: "POST",
  });

  const response = await blockPartnerBrandMutation({
    request: request as never,
    context: {
      userId: "user_123",
      userEmail: "person@example.com",
      tenantOrganization: {
        id: "org_brand",
        slug: "brand-workspace",
        name: "Brand Workspace",
        organizationType: "brand",
      },
      targetOrganization: {
        id: "org_brand",
        slug: "brand-workspace",
        name: "Brand Workspace",
        organizationType: "brand",
      },
      selectedBrandSlug: null,
      mode: "tenant",
      brandMemberId: null,
    },
    action: "products.create",
    resourceType: "product",
  });

  assert.equal(response, null);
});
