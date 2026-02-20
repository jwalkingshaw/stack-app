import test from "node:test";
import assert from "node:assert/strict";
import type { NextResponse } from "next/server";
import { enforceMarketScopedAccess } from "./market-scope";

type StubAuthService = {
  hasScopedPermission: (params: {
    userId: string;
    organizationId: string;
    permissionKey: string;
    marketId?: string | null;
    channelId?: string | null;
    collectionId?: string | null;
  }) => Promise<boolean>;
};

function createSupabaseStub(config: {
  marketExists?: boolean;
  localeExists?: boolean;
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
        ilike(key: string, value: any) {
          state[key] = value;
          return chain;
        },
        async maybeSingle() {
          if (table === "markets") {
            if (config.marketExists === false) {
              return { data: null, error: null };
            }
            return { data: { id: state.id || "mkt_1" }, error: null };
          }

          if (table === "market_locales") {
            if (config.localeExists === false) {
              return { data: null, error: null };
            }
            return { data: { id: "ml_1" }, error: null };
          }

          return { data: null, error: null };
        },
      };

      return chain;
    },
  };
}

function createAuthStub(resolver: (marketId?: string | null) => boolean): StubAuthService {
  return {
    async hasScopedPermission(params) {
      return resolver(params.marketId);
    },
  };
}

async function responseStatus(response: NextResponse) {
  return response.status;
}

test("denies when marketId is missing and user lacks org-level permission", async () => {
  const result = await enforceMarketScopedAccess({
    authService: createAuthStub(() => false) as any,
    supabase: createSupabaseStub({}) as any,
    userId: "user_1",
    organizationId: "org_1",
    permissionKey: "product.market.scope.read",
  });

  assert.equal(result.ok, false);
  assert.equal(await responseStatus((result as any).response), 403);
});

test("allows when marketId is missing but user has org-level permission", async () => {
  const result = await enforceMarketScopedAccess({
    authService: createAuthStub(() => true) as any,
    supabase: createSupabaseStub({}) as any,
    userId: "user_1",
    organizationId: "org_1",
    permissionKey: "product.market.scope.read",
  });

  assert.equal(result.ok, true);
  assert.equal((result as any).marketId, null);
});

test("denies when market does not exist in organization", async () => {
  const result = await enforceMarketScopedAccess({
    authService: createAuthStub(() => true) as any,
    supabase: createSupabaseStub({ marketExists: false }) as any,
    userId: "user_1",
    organizationId: "org_1",
    permissionKey: "product.market.scope.read",
    marketId: "mkt_missing",
  });

  assert.equal(result.ok, false);
  assert.equal(await responseStatus((result as any).response), 404);
});

test("denies when user lacks permission for requested market scope", async () => {
  const result = await enforceMarketScopedAccess({
    authService: createAuthStub((marketId) => marketId !== "mkt_denied") as any,
    supabase: createSupabaseStub({ marketExists: true }) as any,
    userId: "user_1",
    organizationId: "org_1",
    permissionKey: "product.market.scope.read",
    marketId: "mkt_denied",
    channelId: "chn_1",
    collectionId: "col_1",
  });

  assert.equal(result.ok, false);
  assert.equal(await responseStatus((result as any).response), 403);
});

test("denies when locale is not enabled for allowed market", async () => {
  const result = await enforceMarketScopedAccess({
    authService: createAuthStub(() => true) as any,
    supabase: createSupabaseStub({ marketExists: true, localeExists: false }) as any,
    userId: "user_1",
    organizationId: "org_1",
    permissionKey: "product.market.scope.read",
    marketId: "mkt_1",
    localeCode: "es-MX",
  });

  assert.equal(result.ok, false);
  assert.equal(await responseStatus((result as any).response), 403);
});

test("passes channel and collection scope into org-level permission check", async () => {
  let captured:
    | {
        channelId?: string | null;
        collectionId?: string | null;
      }
    | undefined;

  const authStub: StubAuthService = {
    async hasScopedPermission(params) {
      captured = {
        channelId: params.channelId ?? null,
        collectionId: params.collectionId ?? null,
      };
      return true;
    },
  };

  const result = await enforceMarketScopedAccess({
    authService: authStub as any,
    supabase: createSupabaseStub({}) as any,
    userId: "user_1",
    organizationId: "org_1",
    permissionKey: "asset.download.derivative",
    channelId: "ch_1",
    collectionId: "col_1",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(captured, { channelId: "ch_1", collectionId: "col_1" });
});

test("denies implicit global access when scoped org-level check returns false", async () => {
  const authStub: StubAuthService = {
    async hasScopedPermission(params) {
      return params.channelId === "ch_allowed" && params.collectionId === "col_allowed";
    },
  };

  const denied = await enforceMarketScopedAccess({
    authService: authStub as any,
    supabase: createSupabaseStub({}) as any,
    userId: "user_1",
    organizationId: "org_1",
    permissionKey: "asset.download.derivative",
    channelId: "ch_denied",
    collectionId: "col_allowed",
  });

  assert.equal(denied.ok, false);
  assert.equal(await responseStatus((denied as any).response), 403);
});
