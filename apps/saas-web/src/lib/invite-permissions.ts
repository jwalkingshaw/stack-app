import type { SupabaseClient } from '@supabase/supabase-js';

export type PermissionLevel = 'none' | 'view' | 'edit' | 'admin';
export type InviteModuleKey = 'products' | 'assets' | 'share_links';

export type InvitePermissionsSnapshot = {
  module_levels?: Partial<Record<InviteModuleKey, PermissionLevel>>;
  scopes?: {
    market_ids?: string[];
    collection_ids?: string[];
  };
};

const PERMISSION_LEVEL_ORDER: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  admin: 3,
};

const MODULE_PERMISSION_LEVEL_KEYS: Record<InviteModuleKey, Record<Exclude<PermissionLevel, 'none'>, string[]>> = {
  products: {
    view: ['product.market.scope.read'],
    edit: ['product.market.scope.read', 'product.market.scope.edit', 'product.attribute.edit', 'product.media.map'],
    admin: [
      'product.market.scope.read',
      'product.market.scope.edit',
      'product.attribute.edit',
      'product.media.map',
      'product.publish.state',
    ],
  },
  assets: {
    view: ['asset.download.derivative'],
    edit: ['asset.download.derivative', 'asset.metadata.edit'],
    admin: [
      'asset.download.derivative',
      'asset.metadata.edit',
      'asset.download.original',
      'asset.version.manage',
      'asset.upload',
    ],
  },
  share_links: {
    view: [],
    edit: [],
    admin: [],
  },
};

const VALID_MODULE_KEYS = new Set<InviteModuleKey>(['products', 'assets', 'share_links']);
const VALID_LEVELS = new Set<PermissionLevel>(['none', 'view', 'edit', 'admin']);

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const deduped = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    deduped.add(trimmed);
  }
  return Array.from(deduped);
}

export function normalizeInvitePermissions(input: unknown): InvitePermissionsSnapshot {
  if (!input || typeof input !== 'object') {
    return { module_levels: {}, scopes: { market_ids: [], collection_ids: [] } };
  }

  const raw = input as Record<string, unknown>;
  const rawModuleLevels = raw.module_levels;
  const rawScopes = raw.scopes;

  const moduleLevels: Partial<Record<InviteModuleKey, PermissionLevel>> = {};
  if (rawModuleLevels && typeof rawModuleLevels === 'object') {
    for (const [moduleKey, levelValue] of Object.entries(rawModuleLevels as Record<string, unknown>)) {
      if (!VALID_MODULE_KEYS.has(moduleKey as InviteModuleKey)) continue;
      if (typeof levelValue !== 'string') continue;
      const normalizedLevel = levelValue.trim().toLowerCase() as PermissionLevel;
      if (!VALID_LEVELS.has(normalizedLevel)) continue;
      moduleLevels[moduleKey as InviteModuleKey] = normalizedLevel;
    }
  }

  const marketIds = uniqueStrings((rawScopes as any)?.market_ids);
  const collectionIds = uniqueStrings((rawScopes as any)?.collection_ids);

  return {
    module_levels: moduleLevels,
    scopes: {
      market_ids: marketIds,
      collection_ids: collectionIds,
    },
  };
}

export async function validateInvitePermissionsForOrganization(params: {
  supabase: SupabaseClient<any> | any;
  organizationId: string;
  permissions: InvitePermissionsSnapshot;
}): Promise<{ valid: true } | { valid: false; error: string }> {
  const { supabase, organizationId, permissions } = params;
  const marketIds = permissions.scopes?.market_ids || [];
  const collectionIds = permissions.scopes?.collection_ids || [];

  if (marketIds.length > 0) {
    const { data: markets, error: marketsError } = await supabase
      .from('markets')
      .select('id')
      .eq('organization_id', organizationId)
      .in('id', marketIds);

    if (marketsError) {
      return { valid: false, error: 'Failed to validate selected markets.' };
    }

    if ((markets || []).length !== marketIds.length) {
      return { valid: false, error: 'One or more selected markets are invalid for this workspace.' };
    }
  }

  if (collectionIds.length > 0) {
    const { data: collections, error: collectionsError } = await supabase
      .from('dam_collections')
      .select('id')
      .eq('organization_id', organizationId)
      .in('id', collectionIds);

    if (collectionsError) {
      return { valid: false, error: 'Failed to validate selected shared asset sets.' };
    }

    if ((collections || []).length !== collectionIds.length) {
      return { valid: false, error: 'One or more selected shared asset sets are invalid for this workspace.' };
    }
  }

  return { valid: true };
}

function managedPermissionKeysForModule(moduleKey: InviteModuleKey): string[] {
  const levels = MODULE_PERMISSION_LEVEL_KEYS[moduleKey];
  const allKeys = new Set<string>();
  for (const keys of Object.values(levels)) {
    for (const key of keys) {
      allKeys.add(key);
    }
  }
  return Array.from(allKeys);
}

function permissionKeysForModuleLevel(moduleKey: InviteModuleKey, level: PermissionLevel): string[] {
  if (level === 'none') return [];
  const targetOrder = PERMISSION_LEVEL_ORDER[level];
  const levelKeys: string[] = [];
  for (const candidate of ['view', 'edit', 'admin'] as const) {
    if (PERMISSION_LEVEL_ORDER[candidate] > targetOrder) continue;
    levelKeys.push(...MODULE_PERMISSION_LEVEL_KEYS[moduleKey][candidate]);
  }
  return Array.from(new Set(levelKeys));
}

export async function applyInvitePermissions(params: {
  supabase: SupabaseClient<any> | any;
  organizationId: string;
  userId: string;
  userEmail: string;
  invitedBy?: string | null;
  defaultRole: 'admin' | 'editor' | 'viewer' | 'partner';
  permissions: InvitePermissionsSnapshot;
}): Promise<{ applied: boolean; memberId?: string; error?: string }> {
  const {
    supabase,
    organizationId,
    userId,
    userEmail,
    invitedBy,
    defaultRole,
    permissions,
  } = params;

  const normalized = normalizeInvitePermissions(permissions);
  const validation = await validateInvitePermissionsForOrganization({
    supabase,
    organizationId,
    permissions: normalized,
  });
  if (!validation.valid) {
    return { applied: false, error: validation.error };
  }

  const moduleLevels = normalized.module_levels || {};
  const marketIds = normalized.scopes?.market_ids || [];
  const collectionIds = normalized.scopes?.collection_ids || [];

  const { data: existingMembers, error: memberLookupError } = await supabase
    .from('organization_members')
    .select('id, role, status')
    .eq('organization_id', organizationId)
    .eq('kinde_user_id', userId)
    .limit(1);

  if (memberLookupError) {
    return { applied: false, error: 'Failed to resolve organization member for permission application.' };
  }

  const existingMember = (existingMembers || [])[0] || null;
  let memberId = existingMember?.id as string | undefined;

  if (!memberId) {
    const { data: insertedMember, error: insertMemberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        kinde_user_id: userId,
        email: userEmail.toLowerCase().trim(),
        role: defaultRole,
        status: 'active',
        invited_by: invitedBy || null,
      })
      .select('id')
      .single();

    if (insertMemberError || !insertedMember) {
      return { applied: false, error: 'Failed to create organization member for permission application.' };
    }

    memberId = insertedMember.id;
  }

  const managedPermissionKeys = new Set<string>();
  for (const moduleKey of ['products', 'assets', 'share_links'] as InviteModuleKey[]) {
    for (const key of managedPermissionKeysForModule(moduleKey)) {
      managedPermissionKeys.add(key);
    }
  }

  if (managedPermissionKeys.size > 0) {
    const { error: deleteError } = await supabase
      .from('member_scope_permissions')
      .delete()
      .eq('organization_id', organizationId)
      .eq('member_id', memberId)
      .in('permission_key', Array.from(managedPermissionKeys));

    if (deleteError) {
      return { applied: false, error: 'Failed to reset prior scoped permissions before applying invite permissions.' };
    }
  }

  const rowsToInsert: Array<Record<string, unknown>> = [];

  const productsLevel = moduleLevels.products || 'none';
  const productKeys = permissionKeysForModuleLevel('products', productsLevel);
  if (productKeys.length > 0) {
    for (const marketId of marketIds) {
      for (const permissionKey of productKeys) {
        rowsToInsert.push({
          organization_id: organizationId,
          member_id: memberId,
          permission_key: permissionKey,
          scope_type: 'market',
          market_id: marketId,
          granted_by: invitedBy || userId,
        });
      }
    }
  }

  const assetsLevel = moduleLevels.assets || 'none';
  const assetKeys = permissionKeysForModuleLevel('assets', assetsLevel);
  if (assetKeys.length > 0) {
    for (const marketId of marketIds) {
      for (const permissionKey of assetKeys) {
        rowsToInsert.push({
          organization_id: organizationId,
          member_id: memberId,
          permission_key: permissionKey,
          scope_type: 'market',
          market_id: marketId,
          granted_by: invitedBy || userId,
        });
      }
    }

    for (const collectionId of collectionIds) {
      for (const permissionKey of assetKeys) {
        rowsToInsert.push({
          organization_id: organizationId,
          member_id: memberId,
          permission_key: permissionKey,
          scope_type: 'collection',
          collection_id: collectionId,
          granted_by: invitedBy || userId,
        });
      }
    }
  }

  if (rowsToInsert.length > 0) {
    const { error: insertScopesError } = await supabase
      .from('member_scope_permissions')
      .insert(rowsToInsert);

    if (insertScopesError) {
      return { applied: false, error: 'Failed to apply invite-scoped permissions.' };
    }
  }

  return { applied: true, memberId };
}

export function defaultInviteModuleLevels(params: {
  invitationType: 'team_member' | 'partner';
  role?: string;
  accessLevel?: 'view' | 'edit';
}): Partial<Record<InviteModuleKey, PermissionLevel>> {
  const { invitationType, role, accessLevel } = params;

  if (invitationType === 'partner') {
    return {
      products: accessLevel === 'edit' ? 'edit' : 'view',
      assets: accessLevel === 'edit' ? 'edit' : 'view',
      share_links: 'view',
    };
  }

  if (role === 'admin') {
    return { products: 'admin', assets: 'admin', share_links: 'admin' };
  }
  if (role === 'editor') {
    return { products: 'edit', assets: 'edit', share_links: 'edit' };
  }
  return { products: 'view', assets: 'view', share_links: 'view' };
}
