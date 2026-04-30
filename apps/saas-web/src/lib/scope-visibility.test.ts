import test from "node:test";
import assert from "node:assert/strict";
import { hasLiveScopeControls } from "./scope-visibility";

test("returns false when channels and destinations are empty", () => {
  assert.equal(hasLiveScopeControls({ channels: [], destinations: [] }), false);
});

test("returns true when at least one channel is active", () => {
  assert.equal(
    hasLiveScopeControls({
      channels: [{ is_active: false }, { is_active: true }],
      destinations: [],
    }),
    true
  );
});

test("returns true when at least one destination is active", () => {
  assert.equal(
    hasLiveScopeControls({
      channels: [{ is_active: false }],
      destinations: [{ is_active: false }, { is_active: true }],
    }),
    true
  );
});

test("returns false when all records are inactive", () => {
  assert.equal(
    hasLiveScopeControls({
      channels: [{ is_active: false }],
      destinations: [{ is_active: false }],
    }),
    false
  );
});

