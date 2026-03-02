"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { PageContentContainer } from "@/components/ui/page-content-container";

type ShareSet = {
  id: string;
  name: string;
  module_key: "assets" | "products";
};

type PartnerGrant = {
  id: string;
  share_set_id: string;
  access_level: "view" | "edit";
  status: "active" | "revoked";
  created_at: string | null;
  updated_at: string | null;
  share_set: ShareSet | null;
};

type Relationship = {
  id: string;
  partner_organization_id: string;
  status: string;
  access_level: "view" | "edit";
  created_at: string | null;
  updated_at: string | null;
};

type PartnerOrganization = {
  id: string;
  name: string;
  slug: string | null;
  organization_type?: string | null;
  partner_category?: string | null;
};

type PartnerPayload = {
  can_manage: boolean;
  relationship: Relationship;
  partner_organization: PartnerOrganization;
  grants: PartnerGrant[];
  available_sets: ShareSet[];
  share_sets_enabled: boolean;
};

function getSetModuleLabel(moduleKey: ShareSet["module_key"]): "Assets" | "Products" {
  return moduleKey === "assets" ? "Assets" : "Products";
}

export default function PartnerRelationshipClient({
  tenantSlug,
  partnerOrganizationId,
}: {
  tenantSlug: string;
  partnerOrganizationId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PartnerPayload | null>(null);
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<"view" | "edit">("view");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [selectedGrantAccess, setSelectedGrantAccess] = useState<"view" | "edit">("view");
  const [assigning, setAssigning] = useState(false);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `/api/${tenantSlug}/team/partners/${partnerOrganizationId}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load partner relationship");
      }
      const nextData = payload.data as PartnerPayload;
      setData(nextData);
      setSelectedAccessLevel(nextData.relationship.access_level || "view");
    } catch (fetchError: any) {
      setError(fetchError?.message || "Failed to load partner relationship");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, partnerOrganizationId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const setOptions = useMemo(() => data?.available_sets || [], [data?.available_sets]);
  const activeGrantBySetId = useMemo(
    () => new Map((data?.grants || []).map((grant) => [grant.share_set_id, grant])),
    [data?.grants]
  );
  const selectedSetIsAssigned = Boolean(selectedSetId && activeGrantBySetId.has(selectedSetId));

  useEffect(() => {
    if (!selectedSetId && setOptions.length > 0) {
      setSelectedSetId(setOptions[0].id);
      return;
    }
    if (selectedSetId && !setOptions.some((setItem) => setItem.id === selectedSetId)) {
      setSelectedSetId(setOptions[0]?.id || "");
    }
  }, [setOptions, selectedSetId]);

  const updateRelationship = async (body: Record<string, unknown>) => {
    try {
      setSaving(true);
      setError(null);
      const response = await fetch(
        `/api/${tenantSlug}/team/partners/${partnerOrganizationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update partner relationship");
      }
      await fetchDetails();
    } catch (updateError: any) {
      setError(updateError?.message || "Failed to update partner relationship");
    } finally {
      setSaving(false);
    }
  };

  const assignSetToPartner = async () => {
    if (!selectedSetId) return;
    try {
      setAssigning(true);
      setError(null);
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${selectedSetId}/grants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partnerOrganizationId,
            accessLevel: selectedGrantAccess,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to assign set");
      }
      await fetchDetails();
    } catch (assignError: any) {
      setError(assignError?.message || "Failed to assign set");
    } finally {
      setAssigning(false);
    }
  };

  const revokeSetGrant = async (grant: PartnerGrant) => {
    if (!grant.share_set_id) return;
    try {
      setRevokingGrantId(grant.id);
      setError(null);
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${grant.share_set_id}/grants?grantId=${encodeURIComponent(grant.id)}`,
        {
          method: "DELETE",
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to revoke set assignment");
      }
      await fetchDetails();
    } catch (revokeError: any) {
      setError(revokeError?.message || "Failed to revoke set assignment");
    } finally {
      setRevokingGrantId(null);
    }
  };

  if (loading) {
    return (
      <PageContentContainer mode="content" className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
        <div className="h-36 animate-pulse rounded-lg border border-border bg-muted/40" />
      </PageContentContainer>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Link href={`/${tenantSlug}/settings/team/partners`}>
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Partners
          </Button>
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Partner relationship was not found."}
        </div>
      </div>
    );
  }

  const relationship = data.relationship;
  const partner = data.partner_organization;
  const relationshipStatus = String(relationship.status || "active").toLowerCase();
  const statusBadgeClass =
    relationshipStatus === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : relationshipStatus === "suspended" || relationshipStatus === "inactive"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : relationshipStatus === "revoked"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-border bg-muted/30 text-foreground/80";

  return (
    <div className="space-y-6">
      <PageHeader
        title={partner.name}
        description={partner.slug ? `/${partner.slug}` : undefined}
        actions={[
          {
            label: "Back to Partners",
            onClick: () => router.push(`/${tenantSlug}/settings/team/partners`),
            icon: ArrowLeft,
          },
        ]}
      />

      <PageContentContainer mode="content" className="space-y-6">
        <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              Manage relationship access and assigned sets for this partner.
            </p>
          </div>
          <span className={`rounded border px-2 py-1 text-xs font-medium ${statusBadgeClass}`}>
            status: {relationship.status}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 space-y-4">
        <p className="text-sm font-semibold text-foreground">Relationship Access</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-[220px]">
            <Select
              value={selectedAccessLevel}
              onValueChange={(value) => setSelectedAccessLevel(value as "view" | "edit")}
              disabled={!data.can_manage || saving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select access level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">view</SelectItem>
                <SelectItem value="edit">edit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="default"
            onClick={() => updateRelationship({ accessLevel: selectedAccessLevel })}
            disabled={!data.can_manage || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Access Level"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!data.can_manage || saving || relationship.status !== "active"}
            onClick={() => updateRelationship({ action: "suspend" })}
          >
            Suspend
          </Button>
          <Button
            variant="outline"
            disabled={
              !data.can_manage ||
              saving ||
              (relationship.status !== "suspended" && relationship.status !== "inactive")
            }
            onClick={() => updateRelationship({ action: "restore" })}
          >
            Restore
          </Button>
          <Button
            variant="outline"
            disabled={!data.can_manage || saving || relationship.status === "revoked"}
            onClick={() => updateRelationship({ action: "revoke" })}
            className="text-red-700 hover:text-red-800"
          >
            Revoke
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Set Access</p>
          <Link href={`/${tenantSlug}/settings/sets`}>
            <Button variant="outline" size="sm">
              Open Sets
            </Button>
          </Link>
        </div>

        {!data.share_sets_enabled ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Share set tables are not available in this environment yet.
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="w-full lg:max-w-xl">
                <Select
                  value={selectedSetId}
                  onValueChange={setSelectedSetId}
                  disabled={!data.can_manage || assigning || setOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select set" />
                  </SelectTrigger>
                  <SelectContent>
                    {setOptions.map((setItem) => (
                      <SelectItem key={setItem.id} value={setItem.id}>
                        <div className="flex items-center gap-2">
                          <span>{setItem.name}</span>
                          {activeGrantBySetId.has(setItem.id) ? (
                            <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">
                              Assigned
                            </span>
                          ) : null}
                          <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground/70">
                            {getSetModuleLabel(setItem.module_key)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full lg:w-[180px]">
                <Select
                  value={selectedGrantAccess}
                  onValueChange={(value) => setSelectedGrantAccess(value as "view" | "edit")}
                  disabled={!data.can_manage || assigning}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Access" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">view</SelectItem>
                    <SelectItem value="edit">edit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="default"
                onClick={assignSetToPartner}
                disabled={!data.can_manage || assigning || !selectedSetId}
              >
                {assigning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : selectedSetIsAssigned ? (
                  "Save Set Access"
                ) : (
                  "Assign Set"
                )}
              </Button>
            </div>
            {setOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No sets available. Create one in Settings &gt; Sets.
              </p>
            ) : null}

            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
                Active Assignments
              </div>
              {data.grants.length === 0 ? (
                <div className="p-4 text-sm text-foreground/70">No set assignments yet.</div>
              ) : (
                <div className="divide-y divide-border">
                  {data.grants.map((grant) => (
                    <div
                      key={grant.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        {grant.share_set ? (
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-foreground">{grant.share_set.name}</p>
                            <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground/70">
                              {getSetModuleLabel(grant.share_set.module_key)}
                            </span>
                          </div>
                        ) : (
                          <p className="text-sm text-foreground">{grant.share_set_id}</p>
                        )}
                        <p className="text-xs text-muted-foreground">access: {grant.access_level}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!data.can_manage || revokingGrantId === grant.id}
                        onClick={() => revokeSetGrant(grant)}
                      >
                        {revokingGrantId === grant.id ? "Revoking..." : "Revoke"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {!data.can_manage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-center gap-2">
          <Users className="h-4 w-4" />
          You can view partner details, but only admin/owner can update relationship or set access.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      </PageContentContainer>
    </div>
  );
}
