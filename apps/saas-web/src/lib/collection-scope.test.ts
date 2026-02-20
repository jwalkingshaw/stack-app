import test from "node:test";
import assert from "node:assert/strict";
import { enforceCollectionScope } from "./collection-scope";

function createSupabaseStub(config: {
  collectionExists?: boolean;
  assetIds?: string[];
  folderIds?: string[];
  foldersById?: Array<{ id: string; path: string }>;
  descendantsByPath?: Record<string, string[]>;
  assetIdsByFolder?: Record<string, string[]>;
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
        in(key: string, value: any[]) {
          state[key] = value;
          return chain;
        },
        like(key: string, value: string) {
          state[key] = value;
          return chain;
        },
        async maybeSingle() {
          if (table !== "dam_collections") {
            return { data: null, error: null };
          }
          if (config.collectionExists === false) {
            return { data: null, error: null };
          }
          return {
            data: {
              id: state.id || "col_1",
              asset_ids: config.assetIds ?? ["asset_1", "asset_2"],
              folder_ids: config.folderIds ?? [],
            },
            error: null,
          };
        },
        async then(resolve: any) {
          if (table === "dam_folders") {
            if (Array.isArray(state.id)) {
              const ids = state.id as string[];
              const rows = (config.foldersById || []).filter((folder) => ids.includes(folder.id));
              return resolve({ data: rows, error: null });
            }
            if (typeof state.path === "string") {
              const descendants = config.descendantsByPath?.[state.path] || [];
              return resolve({
                data: descendants.map((id) => ({ id })),
                error: null,
              });
            }
            return resolve({ data: [], error: null });
          }

          if (table === "dam_assets") {
            const folderIds = Array.isArray(state.folder_id) ? (state.folder_id as string[]) : [];
            const ids = new Set<string>();
            folderIds.forEach((folderId) => {
              (config.assetIdsByFolder?.[folderId] || []).forEach((id) => ids.add(id));
            });
            return resolve({
              data: Array.from(ids).map((id) => ({ id })),
              error: null,
            });
          }

          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  };
}

test("allows when no collection is provided", async () => {
  const result = await enforceCollectionScope({
    supabase: createSupabaseStub({}) as any,
    organizationId: "org_1",
    collectionId: null,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.assetIds, null);
  }
});

test("denies when collection does not exist in organization", async () => {
  const result = await enforceCollectionScope({
    supabase: createSupabaseStub({ collectionExists: false }) as any,
    organizationId: "org_1",
    collectionId: "col_missing",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 404);
  }
});

test("denies when asset is outside requested collection", async () => {
  const result = await enforceCollectionScope({
    supabase: createSupabaseStub({ assetIds: ["asset_1"] }) as any,
    organizationId: "org_1",
    collectionId: "col_1",
    assetId: "asset_2",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 404);
  }
});

test("allows when asset belongs to requested collection", async () => {
  const result = await enforceCollectionScope({
    supabase: createSupabaseStub({ assetIds: ["asset_1", "asset_2"] }) as any,
    organizationId: "org_1",
    collectionId: "col_1",
    assetId: "asset_2",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.assetIds, ["asset_1", "asset_2"]);
  }
});

test("allows when asset belongs to a folder shared by collection", async () => {
  const result = await enforceCollectionScope({
    supabase: createSupabaseStub({
      assetIds: [],
      folderIds: ["folder_root"],
      foldersById: [{ id: "folder_root", path: "/Catalog" }],
      descendantsByPath: { "/Catalog/%": ["folder_child"] },
      assetIdsByFolder: {
        folder_root: ["asset_root"],
        folder_child: ["asset_child"],
      },
    }) as any,
    organizationId: "org_1",
    collectionId: "col_1",
    assetId: "asset_child",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.assetIds, ["asset_root", "asset_child"]);
  }
});
