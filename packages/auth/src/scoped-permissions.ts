export const ScopedPermission = {
  AssetUpload: "asset.upload",
  AssetMetadataEdit: "asset.metadata.edit",
  AssetDownloadOriginal: "asset.download.original",
  AssetDownloadDerivative: "asset.download.derivative",
  AssetVersionManage: "asset.version.manage",
  ProductAttributeEdit: "product.attribute.edit",
  ProductMediaMap: "product.media.map",
  ProductMarketScopeRead: "product.market.scope.read",
  ProductMarketScopeEdit: "product.market.scope.edit",
  ProductPublishState: "product.publish.state",
  InviteSend: "invite.send",
  InviteRevoke: "invite.revoke",
  MemberRoleAssign: "member.role.assign",
  ContainerShareManage: "container.share.manage",
  AuditRead: "audit.read",
} as const;

export type ScopedPermissionKey =
  (typeof ScopedPermission)[keyof typeof ScopedPermission];
