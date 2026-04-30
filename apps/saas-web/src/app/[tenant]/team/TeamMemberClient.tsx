"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsPageContent } from "../settings/components/settings-page-content";

type EditableRole = "admin" | "editor" | "viewer";
type MemberRole = "owner" | EditableRole;

type MemberPayload = {
  member: {
    id: string;
    email: string;
    role: MemberRole;
    status: string;
    joined_at: string | null;
    can_download_assets: boolean;
    can_edit_products: boolean;
    can_manage_team: boolean;
  };
  capabilities: {
    can_change_role: boolean;
    can_remove: boolean;
    role_options: EditableRole[];
    is_current_user: boolean;
  };
};

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: "Full access to everything",
  admin: "Manage team and all content",
  editor: "Create and edit content",
  viewer: "View and download only",
};

export default function TeamMemberClient({
  tenantSlug,
  memberId,
}: {
  tenantSlug: string;
  memberId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MemberPayload | null>(null);
  const [selectedRole, setSelectedRole] = useState<EditableRole | "">("");

  const fetchMember = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/team/members/${memberId}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load team member");
      }

      const nextData = payload.data as MemberPayload;
      setData(nextData);

      const nextRole = nextData.member.role;
      setSelectedRole(nextRole === "owner" ? "" : nextRole);
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load team member");
    } finally {
      setLoading(false);
    }
  }, [memberId, tenantSlug]);

  useEffect(() => {
    void fetchMember();
  }, [fetchMember]);

  const roleHasChanged = useMemo(() => {
    if (!data || !selectedRole) return false;
    return data.member.role !== selectedRole;
  }, [data, selectedRole]);

  const handleSaveRole = async () => {
    if (!data || !selectedRole || !roleHasChanged) return;
    try {
      setSavingRole(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/team/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update member role");
      }
      await fetchMember();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update member role");
    } finally {
      setSavingRole(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!data?.capabilities.can_remove) return;
    if (!window.confirm(`Remove ${data.member.email} from this workspace?`)) return;

    try {
      setRemoving(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/team/members/${memberId}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to remove member");
      }
      router.push(`/${tenantSlug}/settings/team`);
    } catch (removeError: unknown) {
      setError(removeError instanceof Error ? removeError.message : "Failed to remove member");
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <SettingsPageContent page="team-member-detail" className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
      </SettingsPageContent>
    );
  }

  if (!data) {
    return (
      <SettingsPageContent page="team-member-detail" className="space-y-4">
        <PageHeader
          title="Team Member"
          backHref={`/${tenantSlug}/settings/team`}
          backLabel="Back to Team"
        />
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Team member not found."}
        </div>
      </SettingsPageContent>
    );
  }

  const member = data.member;
  const role = member.role;

  return (
    <SettingsPageContent page="team-member-detail">
      <PageHeader
        title={member.email}
        description="Manage role and workspace access for this member."
        backHref={`/${tenantSlug}/settings/team`}
        backLabel="Back to Team"
      />
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Current role</p>
            <p className="text-sm font-medium text-foreground">{ROLE_LABELS[role]}</p>
            <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
          </div>
          <Badge variant={role === "owner" ? "purple" : role === "admin" ? "info" : role === "editor" ? "success" : "neutral"}>
            {ROLE_LABELS[role]}
          </Badge>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 space-y-4">
        <p className="text-sm font-semibold text-foreground">Role Management</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-[220px]">
            <Select
              value={selectedRole || "__none__"}
              onValueChange={(value) =>
                setSelectedRole(value === "__none__" ? "" : (value as EditableRole))
              }
              disabled={!data.capabilities.can_change_role || savingRole}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {data.capabilities.role_options.map((roleOption) => (
                  <SelectItem key={roleOption} value={roleOption}>
                    {ROLE_LABELS[roleOption]}
                  </SelectItem>
                ))}
                {data.capabilities.role_options.length === 0 && (
                  <SelectItem value="__none__" disabled>
                    No editable roles
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveRole()}
            disabled={
              savingRole ||
              !data.capabilities.can_change_role ||
              !selectedRole ||
              !roleHasChanged
            }
          >
            {savingRole ? "Saving..." : "Save Role"}
          </Button>
        </div>
        {!data.capabilities.can_change_role && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            This member&apos;s role cannot be changed with your current permissions.
          </div>
        )}
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-700">Remove Team Member</p>
            <p className="text-xs text-red-700/80">
              Removing a member revokes workspace access immediately.
            </p>
          </div>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void handleRemoveMember()}
          disabled={!data.capabilities.can_remove || removing}
        >
          {removing ? "Removing..." : "Remove Member"}
        </Button>
        {!data.capabilities.can_remove && (
          <p className="text-xs text-red-700/80">
            You cannot remove this member with your current permissions.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </SettingsPageContent>
  );
}
