import { ScopedPermission } from "@tradetool/auth";

export const SHAREABLE_SCOPE_TYPES = ["market", "channel", "collection"] as const;
export type ShareableScopeType = (typeof SHAREABLE_SCOPE_TYPES)[number];

const SHAREABLE_PERMISSION_KEYS = new Set<string>([
  ScopedPermission.ProductMarketScopeRead,
  ScopedPermission.ProductMarketScopeEdit,
  ScopedPermission.ProductPublishState,
  ScopedPermission.ProductMediaMap,
  ScopedPermission.AssetDownloadDerivative,
  ScopedPermission.AssetDownloadOriginal,
  ScopedPermission.AssetMetadataEdit,
]);

export function parseShareScopeType(value: unknown): ShareableScopeType | null {
  if (typeof value !== "string") return null;
  return SHAREABLE_SCOPE_TYPES.includes(value as ShareableScopeType)
    ? (value as ShareableScopeType)
    : null;
}

export function isShareablePermissionKey(value: unknown): boolean {
  return typeof value === "string" && SHAREABLE_PERMISSION_KEYS.has(value);
}
