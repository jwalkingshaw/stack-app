import test from "node:test";
import assert from "node:assert/strict";
import {
  formatTemplateHeader,
  parseAssetReferenceValue,
  parseCsvText,
  parseTemplateHeader,
  resolveImportDisposition,
} from "./product-imports";

test("parseTemplateHeader extracts the code suffix", () => {
  assert.deepEqual(parseTemplateHeader("Product Name [product_name]"), {
    label: "Product Name",
    code: "product_name",
  });
});

test("parseCsvText preserves quoted commas", () => {
  const parsed = parseCsvText(`${formatTemplateHeader("Product Name", "product_name")},${formatTemplateHeader("SKU", "sku")}\n"Pre, Workout",PW-1`);
  assert.equal(parsed.rows[0]?.[formatTemplateHeader("Product Name", "product_name")], "Pre, Workout");
  assert.equal(parsed.rows[0]?.[formatTemplateHeader("SKU", "sku")], "PW-1");
});

test("parseAssetReferenceValue accepts UUIDs and asset refs", () => {
  assert.deepEqual(parseAssetReferenceValue("AST-42"), {
    assetId: null,
    assetRef: "AST-42",
  });
  assert.deepEqual(parseAssetReferenceValue("4d36a7d0-2dfe-4e1d-b0fc-f4b0a4ee5ffb"), {
    assetId: "4d36a7d0-2dfe-4e1d-b0fc-f4b0a4ee5ffb",
    assetRef: null,
  });
});

test("resolveImportDisposition prioritizes SCIN updates", () => {
  const result = resolveImportDisposition({
    intent: "both",
    scin: "SCIN-1",
    sku: "SKU-1",
    scinProductId: "product-a",
    skuProductId: "product-a",
    hasCreatePayload: true,
  });
  assert.deepEqual(result, { kind: "update", targetProductId: "product-a" });
});

test("resolveImportDisposition rejects SCIN SKU conflicts", () => {
  const result = resolveImportDisposition({
    intent: "both",
    scin: "SCIN-1",
    sku: "SKU-1",
    scinProductId: "product-a",
    skuProductId: "product-b",
    hasCreatePayload: true,
  });
  assert.equal(result.kind, "invalid");
});

test("resolveImportDisposition allows SKU fallback creates when intent supports it", () => {
  const result = resolveImportDisposition({
    intent: "both",
    scin: null,
    sku: "SKU-NEW",
    scinProductId: null,
    skuProductId: null,
    hasCreatePayload: true,
  });
  assert.deepEqual(result, { kind: "create" });
});

test("resolveImportDisposition blocks create rows in update only mode", () => {
  const result = resolveImportDisposition({
    intent: "update_only",
    scin: null,
    sku: "SKU-NEW",
    scinProductId: null,
    skuProductId: null,
    hasCreatePayload: true,
  });
  assert.equal(result.kind, "invalid");
});
