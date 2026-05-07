"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSecondLevelPage } from "../settings/components/settings-page-content";
import { SettingsDetailHeader } from "../settings/components/settings-detail-header";

type OutputChannel = {
  id: string;
  name: string;
  code: string;
  profile_type: string;
};

type ShareSet = {
  id: string;
  name: string;
  module_key: "assets" | "products";
};

type PartnerGrant = {
  id: string;
  share_set_id: string;
  saved_scope_id?: string;
  access_level: "view" | "edit";
  status: "active" | "revoked";
  created_at: string | null;
  updated_at: string | null;
  share_set: ShareSet | null;
  saved_scope?: ShareSet | null;
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
  contract_grants: Array<{
    id: string;
    output_profile_id: string;
    destination_profile_id?: string;
    access_level: "view" | "download" | "export";
    status: string;
    created_at: string | null;
    updated_at: string | null;
    output_profile: OutputChannel | null;
    destination_profile?: OutputChannel | null;
  }>;
  portal_publishes: Array<{
    id: string;
    output_profile_id: string;
    destination_profile_id?: string;
    publish_state: string;
    published_at: string | null;
    output_profile: OutputChannel | null;
    destination_profile?: OutputChannel | null;
  }>;
  available_sets: ShareSet[];
  available_saved_scopes?: ShareSet[];
  share_sets_enabled: boolean;
  saved_scopes_enabled?: boolean;
};

function getScopeKindLabel(moduleKey: ShareSet["module_key"]): "Product Scope" | "Brand Library Scope" {
  return moduleKey === "assets" ? "Brand Library Scope" : "Product Scope";
}

function getStatusBadgeClass(status: string) {
  const relationshipStatus = String(status || "active").toLowerCase();
  if (relationshipStatus === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (relationshipStatus === "suspended" || relationshipStatus === "inactive") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (relationshipStatus === "revoked") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-border bg-muted/30 text-foreground/80";
}

function formatDateTime(value: string | null) {
  if (!value) return "Not published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not published";
  return date.toLocaleString();
}

export default function PartnerRelationshipClient({
  tenantSlug,
  partnerOrganizationId,
}: {
  tenantSlug: string;
  partnerOrganizationId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PartnerPayload | null>(null);
  const [selectedProductScopeId, setSelectedProductScopeId] = useState("");
  const [selectedBrandLibraryScopeId, setSelectedBrandLibraryScopeId] = useState("");

  const fetchDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/team/partners/${partnerOrganizationId}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load partner relationship");
      }
      setData(payload.data as PartnerPayload);
    } catch (fetchError: unknown) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Failed to load partner relationship"
      );
    } finally {
      setLoading(false);
    }
  }, [partnerOrganizationId, tenantSlug]);

  useEffect(() => {
    void fetchDetails();
  }, [fetchDetails]);

  const setOptions = useMemo(
    () => data?.available_saved_scopes || data?.available_sets || [],
    [data?.available_saved_scopes, data?.available_sets]
  );

  const productScopeOptions = useMemo(
    () => setOptions.filter((setItem) => setItem.module_key === "products"),
    [setOptions]
  );
  const brandLibraryScopeOptions = useMemo(
    () => setOptions.filter((setItem) => setItem.module_key === "assets"),
    [setOptions]
  );

  const activeProductScopes = useMemo(
    () =>
      (data?.grants || []).filter(
        (grant) => (grant.saved_scope || grant.share_set)?.module_key === "products"
      ),
    [data?.grants]
  );
  const activeBrandLibraryScopes = useMemo(
    () =>
      (data?.grants || []).filter(
        (grant) => (grant.saved_scope || grant.share_set)?.module_key === "assets"
      ),
    [data?.grants]
  );

  useEffect(() => {
    if (!selectedProductScopeId && productScopeOptions.length > 0) {
      setSelectedProductScopeId(productScopeOptions[0].id);
    }
  }, [productScopeOptions, selectedProductScopeId]);

  useEffect(() => {
    if (!selectedBrandLibraryScopeId && brandLibraryScopeOptions.length > 0) {
      setSelectedBrandLibraryScopeId(brandLibraryScopeOptions[0].id);
    }
  }, [brandLibraryScopeOptions, selectedBrandLibraryScopeId]);

  const updateRelationship = async (body: Record<string, unknown>) => {
    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/team/partners/${partnerOrganizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update partner relationship");
      }
      await fetchDetails();
    } catch (updateError: unknown) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update partner relationship"
      );
    } finally {
      setSaving(false);
    }
  };

  const assignScopeToPartner = async (shareSetId: string) => {
    if (!shareSetId) return;
    try {
      setAssigning(true);
      setError(null);
      const response = await fetch(`/api/${tenantSlug}/sharing/sets/${shareSetId}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerOrganizationId,
          accessLevel: "view",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to assign scope");
      }
      await fetchDetails();
    } catch (assignError: unknown) {
      setError(assignError instanceof Error ? assignError.message : "Failed to assign scope");
    } finally {
      setAssigning(false);
    }
  };

  const revokeScopeGrant = async (grant: PartnerGrant) => {
    if (!grant.share_set_id) return;
    try {
      setRevokingGrantId(grant.id);
      setError(null);
      const response = await fetch(
        `/api/${tenantSlug}/sharing/sets/${grant.share_set_id}/grants?grantId=${encodeURIComponent(
          grant.id
        )}`,
        {
          method: "DELETE",
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to revoke scope access");
      }
      await fetchDetails();
    } catch (revokeError: unknown) {
      setError(
        revokeError instanceof Error ? revokeError.message : "Failed to revoke scope access"
      );
    } finally {
      setRevokingGrantId(null);
    }
  };

  if (loading) {
    return (
      <SettingsSecondLevelPage page="team-partner-detail">
        <div className="h-10 w-64 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
        <div className="h-36 animate-pulse rounded-lg border border-border bg-muted/40" />
      </SettingsSecondLevelPage>
    );
  }

  if (!data) {
    return (
      <SettingsSecondLevelPage page="team-partner-detail">
        <SettingsDetailHeader
          backHref={`/${tenantSlug}/settings/team/partners`}
          backLabel="Partners"
          title="Partner"
        />
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Partner relationship was not found."}
        </div>
      </SettingsSecondLevelPage>
    );
  }

  const relationship = data.relationship;
  const partner = data.partner_organization;
  const statusBadgeClass = getStatusBadgeClass(relationship.status);

  return (
    <SettingsSecondLevelPage page="team-partner-detail">
      <SettingsDetailHeader
        backHref={`/${tenantSlug}/settings/team/partners`}
        backLabel="Partners"
        title={partner.name}
        meta={partner.slug ? [{ label: partner.slug, mono: true }] : undefined}
      />

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
          <span className={`rounded border px-2 py-1 text-xs font-medium ${statusBadgeClass}`}>
            status: {relationship.status}
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Portal Access</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {data.contract_grants.length > 0 ? "On" : "Off"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Launch access is limited to the single Portal profile.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Product Scopes</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{activeProductScopes.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No Product Scope selected means full published Portal catalog access.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Brand Library Scopes</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {activeBrandLibraryScopes.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Extra standalone files and assets outside product-linked access.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Portal Publishes</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {data.portal_publishes.length}
              </p>
            </div>
            <Link href={`/${tenantSlug}/syndication`}>
              <Button variant="outline" size="sm">
                Open Publishing
              </Button>
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Recent partner-facing publishes for this relationship.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Relationship Status</p>
          <p className="text-xs text-muted-foreground">
            Portal access for partners is always read-only. Use the status controls below to suspend, restore, or revoke the relationship.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!data.can_manage || saving || relationship.status !== "active"}
            onClick={() => void updateRelationship({ action: "suspend" })}
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
            onClick={() => void updateRelationship({ action: "restore" })}
          >
            Restore
          </Button>
          <Button
            variant="outline"
            disabled={!data.can_manage || saving || relationship.status === "revoked"}
            onClick={() => void updateRelationship({ action: "revoke" })}
            className="text-red-700 hover:text-red-800"
          >
            Revoke
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Product Scopes</p>
              <p className="text-xs text-muted-foreground">
                Product Scopes control which products this partner can see. Scope-linked assets come with those products automatically.
              </p>
            </div>
            <Link href={`/${tenantSlug}/settings/sets`}>
              <Button variant="outline" size="sm">
                Open Scopes
              </Button>
            </Link>
          </div>

          {!(data.saved_scopes_enabled ?? data.share_sets_enabled) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Scope tables are not available in this environment yet.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="w-full">
                  <Select
                    value={selectedProductScopeId}
                    onValueChange={setSelectedProductScopeId}
                    disabled={!data.can_manage || assigning || productScopeOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Product Scope" />
                    </SelectTrigger>
                    <SelectContent>
                      {productScopeOptions.map((scopeItem) => (
                        <SelectItem key={scopeItem.id} value={scopeItem.id}>
                          {scopeItem.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="default"
                  onClick={() => void assignScopeToPartner(selectedProductScopeId)}
                  disabled={!data.can_manage || assigning || !selectedProductScopeId}
                >
                  {assigning ? "Saving..." : "Assign Product Scope"}
                </Button>
              </div>

              {productScopeOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No Product Scopes available. Create one in Settings &gt; Scopes.
                </p>
              ) : null}

              {activeProductScopes.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  No Product Scope is assigned. This partner can view the full published Portal catalog.
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {activeProductScopes.map((grant) => {
                    const scopeItem = grant.saved_scope || grant.share_set;
                    return (
                      <div
                        key={grant.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-foreground">
                            {scopeItem?.name || grant.saved_scope_id || grant.share_set_id}
                          </p>
                          <p className="text-xs text-muted-foreground">{getScopeKindLabel("products")}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!data.can_manage || revokingGrantId === grant.id}
                          onClick={() => void revokeScopeGrant(grant)}
                        >
                          {revokingGrantId === grant.id ? "Revoking..." : "Revoke"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Brand Library Scopes</p>
              <p className="text-xs text-muted-foreground">
                Brand Library Scopes add standalone files and assets that are not already revealed through product access.
              </p>
            </div>
            <Link href={`/${tenantSlug}/settings/sets`}>
              <Button variant="outline" size="sm">
                Open Scopes
              </Button>
            </Link>
          </div>

          {!(data.saved_scopes_enabled ?? data.share_sets_enabled) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Scope tables are not available in this environment yet.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="w-full">
                  <Select
                    value={selectedBrandLibraryScopeId}
                    onValueChange={setSelectedBrandLibraryScopeId}
                    disabled={!data.can_manage || assigning || brandLibraryScopeOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Brand Library Scope" />
                    </SelectTrigger>
                    <SelectContent>
                      {brandLibraryScopeOptions.map((scopeItem) => (
                        <SelectItem key={scopeItem.id} value={scopeItem.id}>
                          {scopeItem.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="default"
                  onClick={() => void assignScopeToPartner(selectedBrandLibraryScopeId)}
                  disabled={!data.can_manage || assigning || !selectedBrandLibraryScopeId}
                >
                  {assigning ? "Saving..." : "Assign Brand Library Scope"}
                </Button>
              </div>

              {brandLibraryScopeOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No Brand Library Scopes available. Create one in Settings &gt; Scopes.
                </p>
              ) : null}

              {activeBrandLibraryScopes.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  No Brand Library Scope is assigned. Product-linked assets will still come through Product Scope access automatically.
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {activeBrandLibraryScopes.map((grant) => {
                    const scopeItem = grant.saved_scope || grant.share_set;
                    return (
                      <div
                        key={grant.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-foreground">
                            {scopeItem?.name || grant.saved_scope_id || grant.share_set_id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {getScopeKindLabel("assets")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!data.can_manage || revokingGrantId === grant.id}
                          onClick={() => void revokeScopeGrant(grant)}
                        >
                          {revokingGrantId === grant.id ? "Revoking..." : "Revoke"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Portal Access</p>
          <p className="text-xs text-muted-foreground">
            Launch partner access is restricted to the single Portal profile. Markets and locales are resolved through published reads and the scopes attached to this partner workspace.
          </p>
        </div>

        {data.contract_grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Portal access grant is active yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.contract_grants.map((grant) => (
              <div key={grant.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {grant.output_profile?.name || grant.output_profile_id}
                  </p>
                  <p className="text-xs text-muted-foreground">access: {grant.access_level}</p>
                </div>
                <span className="rounded border border-border bg-muted/30 px-2 py-1 text-[10px] uppercase tracking-wide text-foreground/70">
                  {grant.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {data.portal_publishes.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent Portal Publishes
            </p>
            <div className="divide-y divide-border rounded-lg border border-border">
              {data.portal_publishes.map((publish) => (
                <div key={publish.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      {publish.output_profile?.name || publish.output_profile_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(publish.published_at)}
                    </p>
                  </div>
                  <span className="rounded border border-border bg-muted/30 px-2 py-1 text-[10px] uppercase tracking-wide text-foreground/70">
                    {publish.publish_state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {!data.can_manage ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Users className="h-4 w-4" />
          You can view partner details, but only admin or owner can change relationship status or scope access.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </SettingsSecondLevelPage>
  );
}
