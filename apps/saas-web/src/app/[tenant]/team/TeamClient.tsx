"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Mail,
  Shield,
  MoreVertical,
  Copy,
  Check,
  Clock,
  Users as UsersIcon,
  Trash2,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";

interface TeamMember {
  id: string;
  kindeUserId: string;
  email: string;
  role: string;
  canDownloadAssets: boolean;
  canEditProducts: boolean;
  canManageTeam: boolean;
  joinedAt: string;
  status: string;
}

interface ShareContainer {
  id: string;
  name: string;
  code?: string | null;
}

interface ShareScopeGrant {
  id: string;
  member_id: string;
  permission_key: string;
  scope_type: "market" | "channel" | "collection";
  market_id: string | null;
  channel_id: string | null;
  collection_id: string | null;
  expires_at: string | null;
  market?: ShareContainer | ShareContainer[] | null;
  channel?: ShareContainer | ShareContainer[] | null;
  collection?: ShareContainer | ShareContainer[] | null;
}

interface CollectionDefinition {
  id: string;
  name: string;
  asset_ids: string[];
  folder_ids: string[];
}

interface CollectionFolderOption {
  id: string;
  name: string;
  path: string;
}

interface CollectionAssetOption {
  id: string;
  filename: string;
  folder_id: string | null;
}

interface PendingInvitation {
  id: string;
  email: string;
  role_or_access_level: string;
  invitation_type: string;
  token: string;
  expires_at: string;
  created_at: string;
}

interface TeamClientProps {
  tenantSlug: string;
  view?: "internal" | "partners" | "members" | "permissions" | "assetSets";
}

interface PartnerRelationship {
  id: string;
  partner_organization_id: string;
  status: string;
  access_level: string;
  created_at: string | null;
  updated_at: string | null;
  share_set_count?: number;
  partner_organization?: {
    id: string;
    name: string;
    slug: string;
    partner_category?: string | null;
    organization_type?: string | null;
  } | null;
}

type ModuleKey = "products" | "assets";
type ModuleScopeType = "market" | "channel" | "collection";

const MODULE_PERMISSION_CONFIG: Record<
  ModuleKey,
  {
    label: string;
    scopeType: ModuleScopeType;
    scopeLabel: string;
    description: string;
    actions: Array<{ value: string; label: string }>;
  }
> = {
  products: {
    label: "Products (PIM)",
    scopeType: "market",
    scopeLabel: "Market",
    description: "Control read/edit/publish actions for specific markets and locales.",
    actions: [
      { value: "product.market.scope.read", label: "View products" },
      { value: "product.market.scope.edit", label: "Edit product content" },
      { value: "product.publish.state", label: "Change publish state" },
    ],
  },
  assets: {
    label: "Assets (DAM)",
    scopeType: "market",
    scopeLabel: "Market",
    description: "Control DAM actions for selected market scope.",
    actions: [
      { value: "asset.download.derivative", label: "Download derivatives" },
      { value: "asset.download.original", label: "Download originals" },
      { value: "asset.metadata.edit", label: "Edit metadata" },
    ],
  },
};

const getJoinedContainer = (value?: ShareContainer | ShareContainer[] | null) =>
  Array.isArray(value) ? value[0] : value;

const MODULE_KEYS = Object.keys(MODULE_PERMISSION_CONFIG) as ModuleKey[];

const createEmptyPermissionSelection = (): Record<ModuleKey, string[]> => ({
  products: [],
  assets: [],
});

export default function TeamClient({ tenantSlug, view = "members" }: TeamClientProps) {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [partnerRelationships, setPartnerRelationships] = useState<PartnerRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [invitationToDelete, setInvitationToDelete] = useState<{ id: string; email: string } | null>(null);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [sharingAvailable, setSharingAvailable] = useState<boolean | null>(null);
  const [sharingError, setSharingError] = useState("");
  const [shareMarkets, setShareMarkets] = useState<ShareContainer[]>([]);
  const [shareChannels, setShareChannels] = useState<ShareContainer[]>([]);
  const [shareCollections, setShareCollections] = useState<ShareContainer[]>([]);
  const [shareGrants, setShareGrants] = useState<ShareScopeGrant[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedGlobalMarketIds, setSelectedGlobalMarketIds] = useState<string[]>([]);
  const [selectedPermissionKeysByModule, setSelectedPermissionKeysByModule] =
    useState<Record<ModuleKey, string[]>>(createEmptyPermissionSelection);
  const [savingShare, setSavingShare] = useState(false);
  const [removingGrantId, setRemovingGrantId] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionDefinition[]>([]);
  const [collectionFolders, setCollectionFolders] = useState<CollectionFolderOption[]>([]);
  const [collectionAssets, setCollectionAssets] = useState<CollectionAssetOption[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [selectedCollectionFolderIds, setSelectedCollectionFolderIds] = useState<string[]>([]);
  const [selectedCollectionAssetIds, setSelectedCollectionAssetIds] = useState<string[]>([]);
  const [selectedCollectionGrantId, setSelectedCollectionGrantId] = useState("");
  const [selectedCollectionPermissionKeys, setSelectedCollectionPermissionKeys] = useState<string[]>([]);
  const [savingCollectionGrant, setSavingCollectionGrant] = useState(false);
  const [collectionSaving, setCollectionSaving] = useState(false);
  const [collectionDeleting, setCollectionDeleting] = useState(false);
  const [organizationType, setOrganizationType] = useState<"brand" | "partner">("brand");
  const [canManageInvites, setCanManageInvites] = useState(false);

  const fetchTeam = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/${tenantSlug}/team`);
      if (!response.ok) throw new Error("Failed to fetch team");

      const { data } = await response.json();
      setMembers(data.members || []);
      setPendingInvitations(data.pending_invitations || []);
      setPartnerRelationships(data.partner_relationships || []);
      setOrganizationType(data.organization?.organization_type === "partner" ? "partner" : "brand");
      const permissions = data.user_permissions || {};
      setCanManageInvites(
        Boolean(permissions.is_admin || permissions.is_owner || permissions.can_manage_team)
      );
    } catch (error) {
      console.error("Failed to fetch team:", error);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  useEffect(() => {
    if (!selectedMemberId && members.length > 0) {
      setSelectedMemberId(members[0].id);
    }
  }, [members, selectedMemberId]);

  useEffect(() => {
    setSelectedGlobalMarketIds((current) => {
      const validSelected = current.filter((marketId) =>
        shareMarkets.some((market) => market.id === marketId)
      );
      if (validSelected.length > 0) return validSelected;
      return shareMarkets[0]?.id ? [shareMarkets[0].id] : [];
    });
  }, [shareMarkets]);

  const fetchSharing = useCallback(async () => {
    try {
      setSharingLoading(true);
      setSharingError("");
      const [containersRes, scopesRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/sharing/containers`),
        fetch(`/api/${tenantSlug}/sharing/scopes`),
      ]);

      if (containersRes.status === 403 || scopesRes.status === 403) {
        setSharingAvailable(false);
        return;
      }
      if (!containersRes.ok || !scopesRes.ok) {
        throw new Error("Failed to fetch sharing data");
      }

      const containersPayload = await containersRes.json();
      const scopesPayload = await scopesRes.json();
      setShareMarkets(containersPayload?.data?.markets || []);
      setShareChannels(containersPayload?.data?.channels || []);
      setShareCollections(containersPayload?.data?.collections || []);
      setShareGrants(scopesPayload?.data || []);
      setSharingAvailable(true);
    } catch (error) {
      console.error("Failed to load sharing data:", error);
      setSharingError("Unable to load container sharing settings");
    } finally {
      setSharingLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchSharing();
  }, [fetchSharing]);

  const fetchCollections = useCallback(async () => {
    try {
      const [collectionsRes, optionsRes] = await Promise.all([
        fetch(`/api/${tenantSlug}/sharing/collections`),
        fetch(`/api/${tenantSlug}/sharing/collection-options`),
      ]);
      if (!collectionsRes.ok || !optionsRes.ok) {
        return;
      }
      const collectionsPayload = await collectionsRes.json();
      const optionsPayload = await optionsRes.json();
      setCollections(collectionsPayload?.data || []);
      setCollectionFolders(optionsPayload?.data?.folders || []);
      setCollectionAssets(optionsPayload?.data?.assets || []);
    } catch (error) {
      console.error("Failed to load collections:", error);
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (sharingAvailable === false) return;
    fetchCollections();
  }, [sharingAvailable, fetchCollections]);

  useEffect(() => {
    const selected = collections.find((collection) => collection.id === selectedCollectionId) || null;
    if (!selected) {
      setCollectionName("");
      setSelectedCollectionFolderIds([]);
      setSelectedCollectionAssetIds([]);
      return;
    }
    setCollectionName(selected.name);
    setSelectedCollectionFolderIds(selected.folder_ids || []);
    setSelectedCollectionAssetIds(selected.asset_ids || []);
  }, [selectedCollectionId, collections]);

  useEffect(() => {
    if (!selectedMemberId || selectedGlobalMarketIds.length === 0) {
      setSelectedPermissionKeysByModule(createEmptyPermissionSelection());
      return;
    }

    setSelectedPermissionKeysByModule((current) => {
      const next = { ...current };
      let hasChanges = false;

      for (const moduleKey of MODULE_KEYS) {
        const scopeType = MODULE_PERMISSION_CONFIG[moduleKey].scopeType;
        const moduleActionKeys = MODULE_PERMISSION_CONFIG[moduleKey].actions.map((action) => action.value);

        let selectedPermissions: string[] = [];
        if (scopeType === "market") {
          const permissionIntersection = new Set(moduleActionKeys);
          for (const marketId of selectedGlobalMarketIds) {
            const marketPermissions = new Set(
              shareGrants
                .filter(
                  (grant) =>
                    grant.member_id === selectedMemberId &&
                    grant.scope_type === "market" &&
                    grant.market_id === marketId
                )
                .map((grant) => grant.permission_key)
            );

            for (const permissionKey of Array.from(permissionIntersection)) {
              if (!marketPermissions.has(permissionKey)) {
                permissionIntersection.delete(permissionKey);
              }
            }
          }
          selectedPermissions = Array.from(permissionIntersection).sort();
        }

        const currentPermissions = [...(current[moduleKey] || [])].sort();
        const unchanged =
          selectedPermissions.length === currentPermissions.length &&
          selectedPermissions.every((value, index) => value === currentPermissions[index]);
        if (!unchanged) {
          next[moduleKey] = selectedPermissions;
          hasChanges = true;
        }
      }

      return hasChanges ? next : current;
    });
  }, [selectedMemberId, selectedGlobalMarketIds, shareGrants]);

  useEffect(() => {
    if (!selectedCollectionGrantId && shareCollections.length > 0) {
      setSelectedCollectionGrantId(shareCollections[0].id);
    }
    if (
      selectedCollectionGrantId &&
      !shareCollections.some((collection) => collection.id === selectedCollectionGrantId)
    ) {
      setSelectedCollectionGrantId(shareCollections[0]?.id || "");
    }
  }, [shareCollections, selectedCollectionGrantId]);

  useEffect(() => {
    if (!selectedMemberId || !selectedCollectionGrantId) {
      setSelectedCollectionPermissionKeys([]);
      return;
    }

    const existingCollectionPermissions = Array.from(
      new Set(
        shareGrants
          .filter(
            (grant) =>
              grant.member_id === selectedMemberId &&
              grant.scope_type === "collection" &&
              grant.collection_id === selectedCollectionGrantId
          )
          .map((grant) => grant.permission_key)
      )
    );
    setSelectedCollectionPermissionKeys(existingCollectionPermissions);
  }, [selectedMemberId, selectedCollectionGrantId, shareGrants]);

  const copyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/invitations/accept?token=${token}`;
    await navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const openDeleteConfirmation = (invitationId: string, email: string) => {
    setInvitationToDelete({ id: invitationId, email });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteInvitation = async () => {
    if (!invitationToDelete) return;

    setDeletingInviteId(invitationToDelete.id);
    setDeleteConfirmOpen(false);

    try {
      const response = await fetch(
        `/api/${tenantSlug}/team?invitationId=${invitationToDelete.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || "Failed to delete invitation");
      }

      // Refresh team list to remove deleted invitation
      await fetchTeam();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setDeletingInviteId(null);
      setInvitationToDelete(null);
    }
  };

  const handleApplyModulePermissions = async () => {
    if (!selectedMemberId || selectedGlobalMarketIds.length === 0) return;
    setSavingShare(true);
    setSharingError("");
    try {
      for (const moduleKey of MODULE_KEYS) {
        const moduleConfig = MODULE_PERMISSION_CONFIG[moduleKey];
        const scopeType = moduleConfig.scopeType;
        if (scopeType !== "market") continue;

        const modulePermissionSet = new Set(
          moduleConfig.actions.map((action) => action.value)
        );
        const selectedSet = new Set(selectedPermissionKeysByModule[moduleKey] || []);

        for (const selectedMarketId of selectedGlobalMarketIds) {
          const existingModuleGrants = shareGrants.filter((grant) => {
            if (grant.member_id !== selectedMemberId) return false;
            if (grant.scope_type !== "market") return false;
            if (grant.market_id !== selectedMarketId) return false;
            return modulePermissionSet.has(grant.permission_key);
          });

          const toDelete = existingModuleGrants.filter(
            (grant) => !selectedSet.has(grant.permission_key)
          );
          const existingSet = new Set(existingModuleGrants.map((grant) => grant.permission_key));
          const toCreate = moduleConfig.actions
            .map((action) => action.value)
            .filter((permissionKey) => selectedSet.has(permissionKey) && !existingSet.has(permissionKey));

          for (const grant of toDelete) {
            const deleteResponse = await fetch(`/api/${tenantSlug}/sharing/scopes?grantId=${grant.id}`, {
              method: "DELETE",
            });
            if (!deleteResponse.ok) {
              const errorPayload = await deleteResponse.json();
              throw new Error(errorPayload?.error || "Failed to remove sharing scope");
            }
          }

          for (const permissionKey of toCreate) {
            const createResponse = await fetch(`/api/${tenantSlug}/sharing/scopes`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                memberId: selectedMemberId,
                permissionKey,
                scopeType: "market",
                marketId: selectedMarketId,
              }),
            });
            if (!createResponse.ok) {
              const errorPayload = await createResponse.json();
              throw new Error(errorPayload?.error || "Failed to save sharing scope");
            }
          }
        }
      }

      await fetchSharing();
    } catch (error: any) {
      setSharingError(error.message || "Failed to apply permissions");
    } finally {
      setSavingShare(false);
    }
  };

  const handlePermissionToggle = (
    moduleKey: ModuleKey,
    permissionKey: string,
    checked: boolean
  ) => {
    setSelectedPermissionKeysByModule((current) => {
      const currentModuleSelection = current[moduleKey] || [];
      const nextModuleSelection = checked
        ? currentModuleSelection.includes(permissionKey)
          ? currentModuleSelection
          : [...currentModuleSelection, permissionKey]
        : currentModuleSelection.filter((key) => key !== permissionKey);

      return {
        ...current,
        [moduleKey]: nextModuleSelection,
      };
    });
  };

  const handleApplyCollectionPermissions = async () => {
    if (!selectedMemberId || !selectedCollectionGrantId) return;
    setSavingCollectionGrant(true);
    setSharingError("");
    try {
      const collectionPermissionSet = new Set(
        MODULE_PERMISSION_CONFIG.assets.actions.map((action) => action.value)
      );
      const existingCollectionGrants = shareGrants.filter(
        (grant) =>
          grant.member_id === selectedMemberId &&
          grant.scope_type === "collection" &&
          grant.collection_id === selectedCollectionGrantId &&
          collectionPermissionSet.has(grant.permission_key)
      );

      const selectedSet = new Set(selectedCollectionPermissionKeys);
      const toDelete = existingCollectionGrants.filter(
        (grant) => !selectedSet.has(grant.permission_key)
      );
      const existingSet = new Set(existingCollectionGrants.map((grant) => grant.permission_key));
      const toCreate = MODULE_PERMISSION_CONFIG.assets.actions
        .map((action) => action.value)
        .filter((permissionKey) => selectedSet.has(permissionKey) && !existingSet.has(permissionKey));

      for (const grant of toDelete) {
        const deleteResponse = await fetch(`/api/${tenantSlug}/sharing/scopes?grantId=${grant.id}`, {
          method: "DELETE",
        });
        if (!deleteResponse.ok) {
          const errorPayload = await deleteResponse.json();
          throw new Error(errorPayload?.error || "Failed to remove collection permission");
        }
      }

      for (const permissionKey of toCreate) {
        const createResponse = await fetch(`/api/${tenantSlug}/sharing/scopes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: selectedMemberId,
            permissionKey,
            scopeType: "collection",
            collectionId: selectedCollectionGrantId,
          }),
        });
        if (!createResponse.ok) {
          const errorPayload = await createResponse.json();
          throw new Error(errorPayload?.error || "Failed to save collection permission");
        }
      }

      await fetchSharing();
    } catch (error: any) {
      setSharingError(error.message || "Failed to apply collection permissions");
    } finally {
      setSavingCollectionGrant(false);
    }
  };

  const handleRemoveGrant = async (grantId: string) => {
    setRemovingGrantId(grantId);
    setSharingError("");
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/scopes?grantId=${grantId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorPayload = await response.json();
        throw new Error(errorPayload?.error || "Failed to revoke sharing scope");
      }
      await fetchSharing();
    } catch (error: any) {
      setSharingError(error.message || "Failed to revoke sharing scope");
    } finally {
      setRemovingGrantId(null);
    }
  };

  const handleNewCollection = () => {
    setSelectedCollectionId("");
    setCollectionName("");
    setSelectedCollectionFolderIds([]);
    setSelectedCollectionAssetIds([]);
  };

  const handleSaveCollection = async () => {
    const trimmedName = collectionName.trim();
    if (!trimmedName) {
      setSharingError("Collection name is required.");
      return;
    }

    setCollectionSaving(true);
    setSharingError("");
    try {
      const payload = {
        name: trimmedName,
        folderIds: selectedCollectionFolderIds,
        assetIds: selectedCollectionAssetIds,
      };

      const response = selectedCollectionId
        ? await fetch(`/api/${tenantSlug}/sharing/collections/${selectedCollectionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/${tenantSlug}/sharing/collections`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!response.ok) {
        const errorPayload = await response.json();
        throw new Error(errorPayload?.error || "Failed to save collection");
      }

      const result = await response.json();
      const savedId = result?.data?.id;
      await Promise.all([fetchCollections(), fetchSharing()]);
      if (savedId) {
        setSelectedCollectionId(savedId);
      }
    } catch (error: any) {
      setSharingError(error.message || "Failed to save collection");
    } finally {
      setCollectionSaving(false);
    }
  };

  const handleDeleteCollection = async () => {
    if (!selectedCollectionId) return;

    setCollectionDeleting(true);
    setSharingError("");
    try {
      const response = await fetch(`/api/${tenantSlug}/sharing/collections/${selectedCollectionId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorPayload = await response.json();
        throw new Error(errorPayload?.error || "Failed to delete collection");
      }
      handleNewCollection();
      await Promise.all([fetchCollections(), fetchSharing()]);
    } catch (error: any) {
      setSharingError(error.message || "Failed to delete collection");
    } finally {
      setCollectionDeleting(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "admin":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "editor":
        return "bg-green-100 text-green-700 border-green-200";
      case "viewer":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case "owner":
        return "Full access to everything";
      case "admin":
        return "Manage team and all content";
      case "editor":
        return "Create and edit content";
      case "viewer":
        return "View and download only";
      default:
        return "";
    }
  };

  const showInternal = view === "internal" || view === "members";
  const showPartners = view === "partners";
  const showPermissions = view === "permissions";
  const showAssetSets = view === "assetSets";
  const canManagePartnerInvites = canManageInvites && organizationType === "brand";
  const canManageBrandSharing = canManageInvites && organizationType === "brand";
  const headerTitle = showPartners ? "Partners" : "Team";
  const headerDescription = showPartners
    ? `${partnerRelationships.length} ${partnerRelationships.length === 1 ? "partner relationship" : "partner relationships"}`
    : `${members.length} ${members.length === 1 ? "member" : "members"}`;
  const pendingTeamInvitations = pendingInvitations.filter(
    (invitation) => invitation.invitation_type !== "partner"
  );
  const pendingPartnerInvitations = pendingInvitations.filter(
    (invitation) => invitation.invitation_type === "partner"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={headerTitle}
        description={headerDescription}
        actions={[
          ...(canManageInvites && showInternal
            ? [
                {
                  label: "Invite Team Member",
                  onClick: () => router.push(`/${tenantSlug}/settings/team/invite/team`),
                  icon: UserPlus,
                },
              ]
            : []),
          ...(canManagePartnerInvites && showPartners
            ? [
                {
                  label: "Invite Partner",
                  onClick: () => router.push(`/${tenantSlug}/settings/team/invite/partner`),
                  icon: UsersIcon,
                },
              ]
            : []),
        ]}
      />

      <div className="bg-background rounded-lg border border-border shadow-soft p-3">
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          <Link href={`/${tenantSlug}/settings/team`}>
            <Button
              variant="ghost"
              size="sm"
              className={showInternal ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}
            >
              Internal
            </Button>
          </Link>
          <Link href={`/${tenantSlug}/settings/team/partners`}>
            <Button
              variant="ghost"
              size="sm"
              className={showPartners ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}
            >
              Partners
            </Button>
          </Link>
        </div>
      </div>

      {/* Team Members List */}
      {showInternal && (
      <div className="bg-background rounded-lg border border-border shadow-soft">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {members.map((member) => (
              <div
                key={member.id}
                className="p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-medium">
                      {member.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground truncate">
                          {member.email}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${getRoleBadgeColor(
                            member.role
                          )}`}
                        >
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {getRoleDescription(member.role)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">
                      Joined {new Date(member.joinedAt).toLocaleDateString()}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && members.length === 0 && (
          <div className="p-12 text-center">
            <UsersIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-60" />
            <p className="text-muted-foreground">No team members yet</p>
          </div>
        )}
      </div>
      )}

      {!canManageInvites && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You do not have permission to manage invitations in this workspace.
        </div>
      )}

      {/* Pending Invitations */}
      {showInternal && canManageInvites && pendingTeamInvitations.length > 0 && (
        <div className="bg-background rounded-lg border border-border shadow-soft">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending Internal Invitations ({pendingTeamInvitations.length})
            </h3>
          </div>
          <div className="divide-y divide-border">
            {pendingTeamInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className="p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 bg-muted text-muted-foreground rounded-full flex items-center justify-center">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground">
                          {invitation.email}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {invitation.invitation_type === "partner" && (
                          <span className="inline-block px-2 py-0.5 text-xs font-medium rounded border bg-purple-100 text-purple-700 border-purple-200">
                            Partner
                          </span>
                        )}
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${getRoleBadgeColor(
                            invitation.role_or_access_level
                          )}`}
                        >
                          {invitation.role_or_access_level.charAt(0).toUpperCase() +
                            invitation.role_or_access_level.slice(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Expires{" "}
                          {new Date(invitation.expires_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyInviteLink(invitation.token)}
                      className="gap-2"
                    >
                      {copiedToken === invitation.token ? (
                        <>
                          <Check className="h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy Link
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDeleteConfirmation(invitation.id, invitation.email)}
                      disabled={deletingInviteId === invitation.id}
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingInviteId === invitation.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showPartners && (
        <div className="bg-background rounded-lg border border-border shadow-soft">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-medium text-foreground">Partner Organizations</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Active partner relationships with current access scope.
            </p>
          </div>
          {partnerRelationships.length === 0 ? (
            <div className="p-12 text-center">
              <UsersIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-60" />
              <p className="text-muted-foreground">No partner organizations connected yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {partnerRelationships.map((relationship) => (
                <Link
                  key={relationship.id}
                  href={`/${tenantSlug}/settings/team/partners/${relationship.partner_organization_id}`}
                  className="block p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {relationship.partner_organization?.name || relationship.partner_organization_id}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {showPartners && canManagePartnerInvites && pendingPartnerInvitations.length > 0 && (
        <div className="bg-background rounded-lg border border-border shadow-soft">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending Partner Invitations ({pendingPartnerInvitations.length})
            </h3>
          </div>
          <div className="divide-y divide-border">
            {pendingPartnerInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className="p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 bg-muted text-muted-foreground rounded-full flex items-center justify-center">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground">
                          {invitation.email}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded border bg-purple-100 text-purple-700 border-purple-200">
                          Partner
                        </span>
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${getRoleBadgeColor(
                            invitation.role_or_access_level
                          )}`}
                        >
                          {invitation.role_or_access_level.charAt(0).toUpperCase() +
                            invitation.role_or_access_level.slice(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Expires{" "}
                          {new Date(invitation.expires_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyInviteLink(invitation.token)}
                      className="gap-2"
                    >
                      {copiedToken === invitation.token ? (
                        <>
                          <Check className="h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy Link
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDeleteConfirmation(invitation.id, invitation.email)}
                      disabled={deletingInviteId === invitation.id}
                      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingInviteId === invitation.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showPermissions && sharingAvailable !== false && canManageBrandSharing && (
        <div className="bg-background rounded-lg border border-border shadow-soft">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Member Permissions
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              1) Invite user with baseline role. 2) Select member + market (global). 3) Configure Products + Assets actions together.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Markets are a global scope for both DAM and PIM access. Use Shared Asset Sets for additional file/folder-level DAM sharing.
            </p>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <MultiSelect
                options={shareMarkets.map((market) => ({
                  value: market.id,
                  label: market.name,
                }))}
                value={selectedGlobalMarketIds}
                onChange={setSelectedGlobalMarketIds}
                placeholder="Select one or more markets"
              />

              <div className="text-xs text-muted-foreground flex items-center">
                Selected markets apply to both Products and Assets.
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {MODULE_KEYS.map((moduleKey) => {
                const moduleConfig = MODULE_PERMISSION_CONFIG[moduleKey];
                const selectedPermissionKeys = selectedPermissionKeysByModule[moduleKey] || [];
                const hasMarkets = shareMarkets.length > 0;

                return (
                  <div key={moduleKey} className="rounded border border-border p-3">
                    <p className="text-sm font-medium text-foreground">{moduleConfig.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{moduleConfig.description}</p>

                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground">
                        Scope:{" "}
                        <span className="font-medium text-foreground">
                          {selectedGlobalMarketIds.length > 0
                            ? `${selectedGlobalMarketIds.length} market${
                                selectedGlobalMarketIds.length === 1 ? "" : "s"
                              } selected`
                            : "No markets selected"}
                        </span>
                      </p>
                      {!hasMarkets && <p className="text-xs text-muted-foreground mt-2">No markets available yet.</p>}
                    </div>

                    <div className="mt-3 space-y-2">
                      {moduleConfig.actions.map((action) => (
                        <label key={action.value} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedPermissionKeys.includes(action.value)}
                            onChange={(event) =>
                              handlePermissionToggle(moduleKey, action.value, event.target.checked)
                            }
                            disabled={selectedGlobalMarketIds.length === 0}
                          />
                          <span>{action.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded border border-dashed border-border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Best-practice model: baseline role first, then scope-specific module actions. This lets one member have Products + Assets permissions simultaneously with least privilege.
              </p>
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">
                  To pre-assign module scopes at invitation time, we need an invitation scope template persisted and applied on acceptance (next backend phase).
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleApplyModulePermissions}
                disabled={
                  savingShare ||
                  sharingLoading ||
                  !selectedMemberId ||
                  selectedGlobalMarketIds.length === 0
                }
              >
                {savingShare ? "Saving..." : "Apply Permissions (All Modules)"}
              </Button>
            </div>

            {sharingError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {sharingError}
              </div>
            )}

            {sharingLoading ? (
              <div className="space-y-2">
                <div className="h-10 bg-muted rounded animate-pulse" />
                <div className="h-10 bg-muted rounded animate-pulse" />
              </div>
            ) : (
              <div className="divide-y divide-border border border-border rounded-lg">
                {shareGrants
                  .filter(
                    (grant) =>
                      (!selectedMemberId || grant.member_id === selectedMemberId) &&
                      grant.scope_type !== "collection"
                  )
                  .map((grant) => {
                    const market = getJoinedContainer(grant.market);
                    const channel = getJoinedContainer(grant.channel);
                    const collection = getJoinedContainer(grant.collection);
                    const containerLabel =
                      grant.scope_type === "market"
                        ? market?.name || grant.market_id || "Unknown market"
                        : grant.scope_type === "channel"
                        ? channel?.name || grant.channel_id || "Unknown channel"
                        : collection?.name || grant.collection_id || "Unknown collection";
                    const moduleLabel =
                      grant.scope_type === "market"
                        ? "Market Content"
                        : grant.scope_type === "channel"
                          ? "Products"
                          : "Assets";

                    return (
                      <div key={grant.id} className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {moduleLabel}: {grant.permission_key}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {grant.scope_type}: {containerLabel}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveGrant(grant.id)}
                          disabled={removingGrantId === grant.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {removingGrantId === grant.id ? "Removing..." : "Revoke"}
                        </Button>
                      </div>
                    );
                  })}
                {shareGrants.filter(
                  (grant) =>
                    (!selectedMemberId || grant.member_id === selectedMemberId) &&
                    grant.scope_type !== "collection"
                ).length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">No scoped shares for selected member.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showAssetSets && sharingAvailable !== false && canManageBrandSharing && (
        <div className="bg-background rounded-lg border border-border shadow-soft">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-medium text-foreground">Shared Asset Sets</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Create named sets of folders/files for selective DAM sharing. Content outside sets remains private.
            </p>
          </div>
          <div className="p-4 space-y-4">
            <div className="rounded border border-border p-3 space-y-3">
              <p className="text-sm font-medium text-foreground">Set Access to a Shared Asset Set</p>
              <p className="text-xs text-muted-foreground">
                Use this when you want folder/file-level sharing beyond market permissions.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedCollectionGrantId} onValueChange={setSelectedCollectionGrantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shared set" />
                  </SelectTrigger>
                  <SelectContent>
                    {shareCollections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {collection.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {MODULE_PERMISSION_CONFIG.assets.actions.map((action) => (
                  <label key={action.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedCollectionPermissionKeys.includes(action.value)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedCollectionPermissionKeys((current) =>
                          checked
                            ? current.includes(action.value)
                              ? current
                              : [...current, action.value]
                            : current.filter((key) => key !== action.value)
                        );
                      }}
                      disabled={!selectedMemberId || !selectedCollectionGrantId}
                    />
                    <span>{action.label}</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleApplyCollectionPermissions}
                  disabled={
                    savingCollectionGrant ||
                    !selectedMemberId ||
                    !selectedCollectionGrantId
                  }
                >
                  {savingCollectionGrant ? "Saving..." : "Apply Set Permissions"}
                </Button>
              </div>
            </div>

            <div className="divide-y divide-border border border-border rounded-lg">
              {shareGrants
                .filter(
                  (grant) =>
                    (!selectedMemberId || grant.member_id === selectedMemberId) &&
                    grant.scope_type === "collection"
                )
                .map((grant) => {
                  const collection = getJoinedContainer(grant.collection);
                  return (
                    <div key={grant.id} className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          Shared Set: {collection?.name || grant.collection_id || "Unknown set"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{grant.permission_key}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveGrant(grant.id)}
                        disabled={removingGrantId === grant.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        {removingGrantId === grant.id ? "Removing..." : "Revoke"}
                      </Button>
                    </div>
                  );
                })}
              {shareGrants.filter(
                (grant) =>
                  (!selectedMemberId || grant.member_id === selectedMemberId) &&
                  grant.scope_type === "collection"
              ).length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">No shared set permissions for selected member.</div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select value={selectedCollectionId || "__new__"} onValueChange={(value) => {
                if (value === "__new__") {
                  handleNewCollection();
                  return;
                }
                setSelectedCollectionId(value);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select collection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">New Collection</SelectItem>
                  {collections.map((collection) => (
                    <SelectItem key={collection.id} value={collection.id}>
                      {collection.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <input
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
                placeholder="Collection name"
                className="w-full px-3 py-2 border border-input rounded-lg"
              />

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSaveCollection} disabled={collectionSaving}>
                  {collectionSaving ? "Saving..." : "Save Collection"}
                </Button>
                {selectedCollectionId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDeleteCollection}
                    disabled={collectionDeleting}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    {collectionDeleting ? "Deleting..." : "Delete"}
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-foreground mb-2">Folders</p>
                <MultiSelect
                  options={collectionFolders.map((folder) => ({
                    value: folder.id,
                    label: folder.path || folder.name,
                  }))}
                  value={selectedCollectionFolderIds}
                  onChange={setSelectedCollectionFolderIds}
                  placeholder="Select one or more folders"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground mb-2">Files</p>
                <MultiSelect
                  options={collectionAssets.map((asset) => ({
                    value: asset.id,
                    label: asset.filename,
                  }))}
                  value={selectedCollectionAssetIds}
                  onChange={setSelectedCollectionAssetIds}
                  placeholder="Select one or more files"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Invitation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete the invitation for{" "}
              <span className="font-medium text-foreground">
                {invitationToDelete?.email}
              </span>
              ?
            </p>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. The user will no longer be able to accept this invitation.
            </p>
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                onClick={handleDeleteInvitation}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
