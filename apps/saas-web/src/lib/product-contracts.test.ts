import test from "node:test";
import assert from "node:assert/strict";
import { productContractsTestUtils } from "./product-contracts";

test("resolveFieldClass prefers explicit field_class values", () => {
  assert.equal(
    productContractsTestUtils.resolveFieldClass({
      id: "field-1",
      code: "amazon_title",
      name: "Amazon Title",
      field_type: "text",
      field_class: "output",
    }),
    "output"
  );
});

test("resolveFieldClass falls back to system when options flag is present", () => {
  assert.equal(
    productContractsTestUtils.resolveFieldClass({
      id: "field-2",
      code: "title",
      name: "Title",
      field_type: "text",
      options: { is_system: true },
    }),
    "system"
  );
});

test("isValuePresent treats empty strings and empty arrays as missing", () => {
  assert.equal(productContractsTestUtils.isValuePresent(""), false);
  assert.equal(productContractsTestUtils.isValuePresent([]), false);
  assert.equal(productContractsTestUtils.isValuePresent({}), false);
  assert.equal(productContractsTestUtils.isValuePresent("Creatine"), true);
  assert.equal(productContractsTestUtils.isValuePresent(["coa"]), true);
});

test("mapRequiredPartnerDocumentTypes reads typed requirements from metadata", () => {
  assert.deepEqual(
    productContractsTestUtils.mapRequiredPartnerDocumentTypes({
      id: "profile-1",
      code: "chile_pack",
      name: "Chile Registration Pack",
      profile_type: "export",
      metadata: {
        required_partner_document_types: ["free_sale_certificate", "gmp_certificate"],
      },
    }),
    ["free_sale_certificate", "gmp_certificate"]
  );
});

test("scoreDimensionByIdOrCode rewards exact scoped matches", () => {
  assert.equal(
    productContractsTestUtils.scoreDimensionByIdOrCode({
      rowId: "market-1",
      selectedId: "market-1",
      weight: 32,
    }),
    32
  );
  assert.ok(
    productContractsTestUtils.scoreDimensionByIdOrCode({
      rowId: "market-2",
      selectedId: "market-1",
      weight: 32,
    }) < 0
  );
});
