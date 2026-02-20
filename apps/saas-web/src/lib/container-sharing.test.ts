import test from "node:test";
import assert from "node:assert/strict";
import {
  isShareablePermissionKey,
  parseShareScopeType,
} from "./container-sharing";
import { ScopedPermission } from "@tradetool/auth";

test("parses valid share scope types", () => {
  assert.equal(parseShareScopeType("market"), "market");
  assert.equal(parseShareScopeType("channel"), "channel");
  assert.equal(parseShareScopeType("collection"), "collection");
});

test("rejects invalid share scope types", () => {
  assert.equal(parseShareScopeType("organization"), null);
  assert.equal(parseShareScopeType(undefined), null);
});

test("validates shareable container permission keys", () => {
  assert.equal(isShareablePermissionKey(ScopedPermission.ProductMarketScopeRead), true);
  assert.equal(isShareablePermissionKey(ScopedPermission.ProductPublishState), true);
  assert.equal(isShareablePermissionKey(ScopedPermission.AssetDownloadDerivative), true);
  assert.equal(isShareablePermissionKey(ScopedPermission.InviteSend), false);
  assert.equal(isShareablePermissionKey("unknown.permission"), false);
});
