"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { BackLinkButton } from "@/components/ui/back-link-button";
import { SettingsPageContent } from "../settings/components/settings-page-content";

type OutputChannel = {
  id: string;
  name: string;
  code: string;
  profile_type: string;
};

type AssignedMarket = {
  assignment_id?: string;
  market_id: string;
  name: string;
  code: string;
  valid_from: string | null;
  assigned_at?: string;
  output_profile_id: string | null;
  channel: OutputChannel | null;
};

type AvailableMarket = {
  id: string;
  name: string;
  code: string;
};

type PartnerMarketsResponse = {
  error?: string;
  data?: {
    assigned_markets: AssignedMarket[];
    available_markets: AvailableMarket[];
  };
};

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PartnerPayload | null>(null);
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<"view" | "edit">("view");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [selectedGrantAccess, setSelectedGrantAccess] = useState<"view" | "edit">("view");
  const [assigning, setAssigning] = useState(false);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);

  const [marketsLoading, setMarketsLoading] = useState(true);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [marketActionLoading, setMarketActionLoading] = useState(false);
  const [assignedMarkets, setAssignedMarkets] = useState<AssignedMarket[]>([]);
  const [availableMarkets, setAvailableMarkets] = useState<AvailableMarket[]>([]);
  const [addMarketId, setAddMarketId] = useState("");
  const [channels, setChannels] = useState<OutputChannel[]>([]);
  const [updatingChannelForMarket, setUpdatingChannelForMarket] = useState<string | null>(null);

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
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load partner relationship");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, partnerOrganizationId]);

  const fetchMarkets = useCallback(async () => {
    try {
      setMarketsLoading(true);
      setMarketsError(null);
      const response = await fetch(
        `/api/${tenantSlug}/team/partners/${partnerOrganizationId}/markets`
      );
      const payload = (await response.json().catch(() => ({}))) as PartnerMarketsResponse;
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load market assignments");
      }
      setAssignedMarkets(payload.data?.assigned_markets || []);
      setAvailableMarkets(payload.data?.available_markets || []);
    } catch (err) {
      setMarketsError(err instanceof Error ? err.message : "Failed to load market assignments");
    } finally {
      setMarketsLoading(false);
    }
  }, [tenantSlug, partnerOrganizationId]);

  const addMarketAssignment = useCallback(async (marketId: string) => {
    try {
      setMarketActionLoading(true);
      setMarketsError(null);
      const response = await fetch(`/api/${tenantSlug}/markets/${marketId}/partners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerOrganizationId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to assign market");
      }
      await fetchMarkets();
    } catch (err) {
      setMarketsError(err instanceof Error ? err.message : "Failed to assign market");
    } finally {
      setMarketActionLoading(false);
    }
  }, [fetchMarkets, partnerOrganizationId, tenantSlug]);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/output-profiles`);
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.data) {
        setChannels((payload.data as OutputChannel[]).filter((c: OutputChannel & { is_active?: boolean }) => c.is_active !== false));
      }
    } catch {
      // channels are optional — silent fail
    }
  }, [tenantSlug]);

  const updateMarketChannel = useCallback(async (marketId: string, outputProfileId: string | null) => {
    try {
      setUpdatingChannelForMarket(marketId);
      const res = await fetch(`/api/${tenantSlug}/markets/${marketId}/partners`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerOrganizationId, output_profile_id: outputProfileId }),
      });
      if (!res.ok) return;
      // Optimistic update in local state
      setAssignedMarkets((prev) =>
        prev.map((m) => {
          if (m.market_id !== marketId) return m;
          const ch = outputProfileId ? channels.find((c) => c.id === outputProfileId) ?? null : null;
          return { ...m, output_profile_id: outputProfileId, channel: ch };
        })
      );
    } catch {
      // silent
    } finally {
      setUpdatingChannelForMarket(null);
    }
  }, [tenantSlug, partnerOrganizationId, channels]);

  const removeMarketAssignment = useCallback(async (marketId: string) => {
    try {
      setMarketActionLoading(true);
      setMarketsError(null);
      const query = new URLSearchParams({ partnerOrganizationId });
      const response = await fetch(
        `/api/${tenantSlug}/markets/${marketId}/partners?${query.toString()}`,
        { method: "DELETE" }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to remove market assignment");
      }
      await fetchMarkets();
    } catch (err) {
      setMarketsError(err instanceof Error ? err.message : "Failed to remove market assignment");
    } finally {
      setMarketActionLoading(false);
    }
  }, [fetchMarkets, partnerOrganizationId, tenantSlug]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  useEffect(() => {
    void fetchMarkets();
  }, [fetchMarkets]);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

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
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update partner relationship");
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
    } catch (assignError: unknown) {
      setError(assignError instanceof Error ? assignError.message : "Failed to assign set");
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
    } catch (revokeError: unknown) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke set assignment");
    } finally {
      setRevokingGrantId(null);
    }
  };

  if (loading) {
    return (
      <SettingsPageContent page="team-partner-detail" className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
        <div className="h-36 animate-pulse rounded-lg border border-border bg-muted/40" />
      </SettingsPageContent>
    );
  }

  if (!data) {
    return (
      <SettingsPageContent page="team-partner-detail" className="space-y-4">
        <BackLinkButton href={`/${tenantSlug}/settings/team/partners`} label="Back to Partners" />
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Partner relationship was not found."}
        </div>
      </SettingsPageContent>
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
    <SettingsPageContent page="team-partner-detail">
      <PageHeader
        title={partner.name}
        description={partner.slug ? `/${partner.slug}` : undefined}
        backHref={`/${tenantSlug}/settings/team/partners`}
        backLabel="Back to Partners"
      />
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
            {saving ? <><LoadingSkeleton size="sm" className="mr-2" />Saving...</> : "Save Access Level"}
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
        <div>
          <p className="text-sm font-semibold text-foreground">Markets</p>
          <p className="text-xs text-muted-foreground">
            Partners assigned to a market automatically inherit its full catalog.
          </p>
        </div>
        {marketsError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {marketsError}
          </div>
        ) : null}
        {marketsLoading ? (
          <p className="text-sm text-muted-foreground">Loading markets...</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full sm:max-w-xs">
                <Select
                  value={addMarketId}
                  onValueChange={setAddMarketId}
                  disabled={marketActionLoading || availableMarkets.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Add to market" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMarkets.map((market) => (
                      <SelectItem key={market.id} value={market.id}>
                        {market.name} ({market.code})
                      </SelectItem>
                    ))}
                    {availableMarkets.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">
                        All markets already assigned.
                      </div>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="default"
                disabled={!addMarketId || marketActionLoading || !data?.can_manage}
                onClick={() => {
                  if (!addMarketId) return;
                  void addMarketAssignment(addMarketId);
                  setAddMarketId("");
                }}
              >
                Add to Market
              </Button>
            </div>
            {assignedMarkets.length === 0 ? (
              <span className="text-sm text-muted-foreground">No markets assigned.</span>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Market</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Channel</th>
                      <th className="px-3 py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {assignedMarkets.map((market) => (
                      <tr key={market.market_id}>
                        <td className="px-3 py-2">
                          <span className="font-medium">{market.name}</span>
                          <span className="ml-1.5 text-xs text-muted-foreground">({market.code})</span>
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={market.output_profile_id ?? "none"}
                            onValueChange={(val) => {
                              void updateMarketChannel(market.market_id, val === "none" ? null : val);
                            }}
                            disabled={!data?.can_manage || updatingChannelForMarket === market.market_id}
                          >
                            <SelectTrigger className="h-7 text-xs w-[180px]">
                              <SelectValue placeholder="No channel" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                <span className="text-muted-foreground">No channel</span>
                              </SelectItem>
                              {channels.map((ch) => (
                                <SelectItem key={ch.id} value={ch.id}>
                                  {ch.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                            disabled={marketActionLoading || !data?.can_manage}
                            onClick={() => void removeMarketAssignment(market.market_id)}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Exclusive Set Access</p>
            <p className="text-xs text-muted-foreground">
              Use direct grants for exclusive products, launch content, or partner-specific lines. Partners inherit their market catalogs above.
            </p>
          </div>
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
                  <><LoadingSkeleton size="sm" className="mr-2" />Saving...</>
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
              <div className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-foreground">
                Active Assignments
              </div>
              {data.grants.length === 0 ? (
                <div className="p-4 text-sm text-foreground/70">No set assignments yet.</div>
              ) : (
                <div className="divide-y divide-gray-200">
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
    </SettingsPageContent>
  );
}

