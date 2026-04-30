import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeProductFieldOptions,
  normalizeProductFieldValue,
} from "./product-field-options";

test("normalizeProductFieldOptions canonicalizes select options and defaults", () => {
  const result = normalizeProductFieldOptions({
    fieldType: "select",
    options: {
      options: [
        { label: "Ready to Drink", value: "Ready to Drink" },
        { label: "Powder Mix" },
      ],
    },
    defaultValue: "powder_mix",
  });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.options.options, [
    { id: "ready_to_drink", label: "Ready to Drink", value: "ready_to_drink", sort_order: 1 },
    { id: "powder_mix", label: "Powder Mix", value: "powder_mix", sort_order: 2 },
  ]);
  assert.equal(result.defaultValue, "powder_mix");
});

test("normalizeProductFieldOptions canonicalizes multiselect defaults from labels", () => {
  const result = normalizeProductFieldOptions({
    fieldType: "multiselect",
    options: {
      options: [{ label: "Sugar Free" }, { label: "Organic" }],
      defaultValue: ["Sugar Free", "organic"],
    },
  });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.options.defaultValue, ["sugar_free", "organic"]);
});

test("normalizeProductFieldValue preserves false and resolves labels", () => {
  assert.equal(
    normalizeProductFieldValue({
      fieldType: "boolean",
      options: {},
      value: false,
    }).value,
    false
  );

  const fieldOptions = normalizeProductFieldOptions({
    fieldType: "multiselect",
    options: { options: [{ label: "Organic" }, { label: "Sugar Free" }] },
  }).options;

  assert.deepEqual(
    normalizeProductFieldValue({
      fieldType: "multiselect",
      options: fieldOptions,
      value: ["Organic", "sugar_free"],
    }).value,
    ["organic", "sugar_free"]
  );
});
