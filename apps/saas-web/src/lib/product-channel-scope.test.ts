import test from "node:test";
import assert from "node:assert/strict";
import {
  getChannelScopedProductIds,
  resolveProductChannelScope,
} from "./product-channel-scope";

function createSupabaseStub(config: {
  channelExists?: boolean;
  productIds?: string[];
  productIdsError?: boolean;
}) {
  return {
    from(table: string) {
      const state: Record<string, any> = { table };
      const chain = {
        select(_value: string) {
          return chain;
        },
        eq(key: string, value: any) {
          state[key] = value;
          return chain;
        },
        async maybeSingle() {
          if (table === "channels") {
            if (config.channelExists === false) {
              return { data: null, error: null };
            }
            return { data: { id: state.id || "ch_1" }, error: null };
          }
          return { data: null, error: null };
        },
        async then(resolve: any) {
          if (table === "product_field_values") {
            if (config.productIdsError) {
              return resolve({ data: null, error: { message: "query failed" } });
            }
            const data = (config.productIds || []).map((product_id) => ({ product_id }));
            return resolve({ data, error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  };
}

function createAuthStub(config: {
  orgWide?: boolean;
  channelAllowed?: boolean;
}) {
  return {
    async hasScopedPermission(params: {
      channelId?: string | null;
    }) {
      if (!params.channelId) return config.orgWide ?? false;
      return config.channelAllowed ?? false;
    },
  };
}

test("denies when channel is missing and user lacks org-wide permission", async () => {
  const result = await resolveProductChannelScope({
    authService: createAuthStub({ orgWide: false }) as any,
    supabase: createSupabaseStub({}) as any,
    userId: "u1",
    organizationId: "org1",
    permissionKey: "product.market.scope.read",
    channelId: null,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 403);
  }
});

test("denies when requested channel does not exist", async () => {
  const result = await resolveProductChannelScope({
    authService: createAuthStub({ channelAllowed: true }) as any,
    supabase: createSupabaseStub({ channelExists: false }) as any,
    userId: "u1",
    organizationId: "org1",
    permissionKey: "product.market.scope.read",
    channelId: "ch_missing",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 404);
  }
});

test("allows org-wide access when channel is not specified", async () => {
  const result = await resolveProductChannelScope({
    authService: createAuthStub({ orgWide: true }) as any,
    supabase: createSupabaseStub({}) as any,
    userId: "u1",
    organizationId: "org1",
    permissionKey: "product.market.scope.read",
    channelId: null,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.channelId, null);
  }
});

test("resolves channel scope and returns scoped product IDs", async () => {
  const scope = await resolveProductChannelScope({
    authService: createAuthStub({ channelAllowed: true }) as any,
    supabase: createSupabaseStub({ channelExists: true }) as any,
    userId: "u1",
    organizationId: "org1",
    permissionKey: "product.market.scope.read",
    channelId: "ch_1",
  });
  assert.equal(scope.ok, true);

  const ids = await getChannelScopedProductIds({
    supabase: createSupabaseStub({ productIds: ["p1", "p2"] }) as any,
    organizationId: "org1",
    channelId: "ch_1",
  });
  assert.deepEqual(ids, ["p1", "p2"]);
});

test("deduplicates scoped product IDs for a channel", async () => {
  const ids = await getChannelScopedProductIds({
    supabase: createSupabaseStub({ productIds: ["p1", "p2", "p1"] }) as any,
    organizationId: "org1",
    channelId: "ch_1",
  });

  assert.deepEqual(ids, ["p1", "p2"]);
});

test("returns null product IDs when channel scope is org-wide", async () => {
  const ids = await getChannelScopedProductIds({
    supabase: createSupabaseStub({ productIds: ["p1"] }) as any,
    organizationId: "org1",
    channelId: null,
  });

  assert.equal(ids, null);
});

test("returns empty list when channel product lookup fails", async () => {
  const ids = await getChannelScopedProductIds({
    supabase: createSupabaseStub({ productIdsError: true }) as any,
    organizationId: "org1",
    channelId: "ch_1",
  });

  assert.deepEqual(ids, []);
});
