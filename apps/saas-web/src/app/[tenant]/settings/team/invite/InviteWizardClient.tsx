"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { defaultInviteModuleLevels, type PermissionLevel } from "@/lib/invite-permissions";

type InviteModuleKey = "products" | "assets" | "share_links";
type InvitationType = "team_member" | "partner";

type PermissionBundleRule = {
  id: string;
  permission_bundle_id: string;
  module_key: InviteModuleKey;
  level: PermissionLevel;
  scope_defaults: Record<string, unknown>;
};

type PermissionBundle = {
  id: string;
  name: string;
  description: string | null;
  subject_type: "team_member" | "partner";
  is_default: boolean;
  rules: PermissionBundleRule[];
};

type ShareContainer = {
  id: string;
  name: string;
  code?: string | null;
};

type ShareSetOption = {
  id: string;
  name: string;
  module_key: "assets" | "products";
};

type InviteWizardClientProps = {
  tenantSlug: string;
  invitationType: InvitationType;
};

const STEP_LABELS = ["Who", "Access", "Scope", "Review"] as const;
const INVITE_MODULES: Array<{ key: InviteModuleKey; label: string; description: string }> = [
  { key: "products", label: "Products (PIM)", description: "Product data and publish actions" },
  { key: "assets", label: "Assets (DAM)", description: "Asset viewing, metadata, and download actions" },
  { key: "share_links", label: "Share Links", description: "Creation and management of external share links" },
];
const INVITE_LEVEL_OPTIONS: Array<{ value: PermissionLevel; label: string }> = [
  { value: "none", label: "None" },
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
  { value: "admin", label: "Admin" },
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toSubjectType(invitationType: InvitationType): "team_member" | "partner" {
  return invitationType === "team_member" ? "team_member" : "partner";
}

export default function InviteWizardClient({
  tenantSlug,
  invitationType,
}: InviteWizardClientProps) {
  const router = useRouter();
  const isTeamInvite = invitationType === "team_member";

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [accessLevel, setAccessLevel] = useState<"view" | "edit">("view");
  const [inviteModuleLevels, setInviteModuleLevels] = useState<Record<InviteModuleKey, PermissionLevel>>({
    products: "view",
    assets: "view",
    share_links: "view",
  });
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([]);
  const [shareMarkets, setShareMarkets] = useState<ShareContainer[]>([]);
  const [shareSets, setShareSets] = useState<ShareSetOption[]>([]);
  const [selectedShareSetIds, setSelectedShareSetIds] = useState<string[]>([]);
  const [permissionBundles, setPermissionBundles] = useState<PermissionBundle[]>([]);
  const [selectedPermissionBundleId, setSelectedPermissionBundleId] = useState("");

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const title = isTeamInvite ? "Invite Team Member" : "Invite Partner";
  const description = isTeamInvite
    ? "Invite an internal team member and define module access and scope up front."
    : "Invite an external partner and define exactly what they can access.";

  const currentDefaults = useMemo(
    () =>
      defaultInviteModuleLevels({
        invitationType,
        role: inviteRole,
        accessLevel,
      }),
    [invitationType, inviteRole, accessLevel]
  );

  useEffect(() => {
    if (selectedPermissionBundleId) return;
    setInviteModuleLevels((current) => ({
      products: currentDefaults.products ?? current.products,
      assets: currentDefaults.assets ?? current.assets,
      share_links: currentDefaults.share_links ?? current.share_links,
    }));
  }, [currentDefaults, selectedPermissionBundleId]);

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    setConfigError("");
    try {
      const subjectType = toSubjectType(invitationType);
      const requests: Promise<Response>[] = [
        fetch(`/api/${tenantSlug}/permission-bundles?subject_type=${subjectType}`),
        fetch(`/api/${tenantSlug}/sharing/containers`),
      ];
      if (!isTeamInvite) {
        requests.push(fetch(`/api/${tenantSlug}/sharing/sets?page=1&pageSize=200`));
      }
      const [bundlesRes, containersRes, setsRes] = await Promise.all(requests);

      if (bundlesRes.ok) {
        const bundlesPayload = await bundlesRes.json();
        setPermissionBundles(bundlesPayload?.data || []);
      } else if (bundlesRes.status === 403) {
        setPermissionBundles([]);
      } else {
        throw new Error("Failed to load permission templates");
      }

      if (containersRes.ok) {
        const containersPayload = await containersRes.json();
        const markets = containersPayload?.data?.markets || [];
        setShareMarkets(markets);
        setSelectedMarketIds((current) => {
          const valid = current.filter((id) => markets.some((market: ShareContainer) => market.id === id));
          if (valid.length > 0) return valid;
          return markets[0]?.id ? [markets[0].id] : [];
        });
      } else if (containersRes.status === 403) {
        setShareMarkets([]);
        setSelectedMarketIds([]);
      } else {
        throw new Error("Failed to load market scope options");
      }

      if (isTeamInvite) {
        setShareSets([]);
        setSelectedShareSetIds([]);
      } else if (setsRes?.ok) {
        const setsPayload = await setsRes.json();
        const assetSets = Array.isArray(setsPayload?.data?.asset_sets)
          ? setsPayload.data.asset_sets
          : [];
        const productSets = Array.isArray(setsPayload?.data?.product_sets)
          ? setsPayload.data.product_sets
          : [];

        const allSets: ShareSetOption[] = [
          ...assetSets.map((set: any) => ({
            id: set.id,
            name: set.name,
            module_key: "assets" as const,
          })),
          ...productSets.map((set: any) => ({
            id: set.id,
            name: set.name,
            module_key: "products" as const,
          })),
        ];
        setShareSets(allSets);
        setSelectedShareSetIds((current) =>
          current.filter((id) => allSets.some((set) => set.id === id))
        );
      } else if (setsRes?.status === 403) {
        setShareSets([]);
        setSelectedShareSetIds([]);
      } else if (!isTeamInvite) {
        throw new Error("Failed to load sets for partner assignment");
      }
    } catch (error: any) {
      setConfigError(error?.message || "Failed to load invite configuration");
    } finally {
      setLoadingConfig(false);
    }
  }, [tenantSlug, invitationType, isTeamInvite]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleBundleSelect = (value: string) => {
    if (value === "__none__") {
      setSelectedPermissionBundleId("");
      return;
    }

    const selectedBundle = permissionBundles.find((bundle) => bundle.id === value);
    if (!selectedBundle) {
      setSelectedPermissionBundleId("");
      return;
    }

    setSelectedPermissionBundleId(selectedBundle.id);

    const nextLevels: Record<InviteModuleKey, PermissionLevel> = {
      products: "none",
      assets: "none",
      share_links: "none",
    };
    const marketIds = new Set<string>();

    for (const rule of selectedBundle.rules || []) {
      if (rule.module_key in nextLevels) {
        nextLevels[rule.module_key] = rule.level;
      }
      const scopedMarketIds = Array.isArray(rule.scope_defaults?.market_ids)
        ? (rule.scope_defaults.market_ids as unknown[])
        : [];
      for (const marketId of scopedMarketIds) {
        if (typeof marketId === "string" && marketId.trim()) {
          marketIds.add(marketId);
        }
      }
    }

    setInviteModuleLevels(nextLevels);
    if (marketIds.size > 0) {
      setSelectedMarketIds(Array.from(marketIds));
    }
  };

  const canContinueFromStepOne = useMemo(() => {
    if (!email.trim() || !isValidEmail(email.trim())) return false;
    return true;
  }, [email]);

  const canContinueFromStepThree = useMemo(() => {
    if (shareMarkets.length === 0) return true;
    return selectedMarketIds.length > 0;
  }, [shareMarkets.length, selectedMarketIds.length]);

  const handleNext = () => {
    setSubmitError("");
    if (step === 1 && !canContinueFromStepOne) {
      setSubmitError("Enter a valid email address to continue.");
      return;
    }
    if (step === 3 && !canContinueFromStepThree) {
      setSubmitError("Select at least one market scope to continue.");
      return;
    }
    setStep((current) => Math.min(current + 1, STEP_LABELS.length));
  };

  const handleBack = () => {
    setSubmitError("");
    setStep((current) => Math.max(current - 1, 1));
  };

  const handleSendInvite = async () => {
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const endpoint = isTeamInvite
        ? `/api/${tenantSlug}/invites/team`
        : `/api/${tenantSlug}/invites/partner`;

      const requestBody: Record<string, unknown> = {
        email: email.trim(),
        permission_bundle_id: selectedPermissionBundleId || null,
        invite_permissions: {
          module_levels: inviteModuleLevels,
          scopes: {
            market_ids: selectedMarketIds,
            collection_ids: [],
          },
        },
      };

      if (isTeamInvite) {
        requestBody.role = inviteRole;
      } else {
        requestBody.access_level = accessLevel;
        requestBody.share_set_ids = selectedShareSetIds;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to send invitation");
      }

      setInviteSuccess(true);
      setInviteLink(payload?.data?.invitation?.invitation_link || "");
    } catch (error: any) {
      setSubmitError(error?.message || "Failed to send invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleInviteAnother = () => {
    setStep(1);
    setEmail("");
    setInviteRole("viewer");
    setAccessLevel("view");
    setSelectedPermissionBundleId("");
    setInviteModuleLevels({
      products: "view",
      assets: "view",
      share_links: "view",
    });
    setSelectedShareSetIds([]);
    setInviteSuccess(false);
    setInviteLink("");
    setSubmitError("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={[
          {
            label: "Back to Team",
            onClick: () => router.push(`/${tenantSlug}/settings/team`),
          },
        ]}
      />

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="grid grid-cols-4 gap-2">
          {STEP_LABELS.map((label, index) => {
            const stepNumber = index + 1;
            const active = step === stepNumber;
            const complete = step > stepNumber;
            return (
              <div
                key={label}
                className={`rounded-md border px-3 py-2 text-xs ${
                  active
                    ? "border-primary bg-primary/5 text-primary"
                    : complete
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-border text-muted-foreground"
                }`}
              >
                <div className="font-medium">Step {stepNumber}</div>
                <div>{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-5 space-y-5">
        {loadingConfig ? (
          <div className="text-sm text-muted-foreground">Loading invite configuration...</div>
        ) : (
          <>
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-base font-medium text-foreground">Who are you inviting?</h2>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={isTeamInvite ? "colleague@company.com" : "partner@retailer.com"}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm"
                  />
                </div>
                {isTeamInvite ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Team Role</label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Partner Access</label>
                    <Select value={accessLevel} onValueChange={(value) => setAccessLevel(value as "view" | "edit")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">View</SelectItem>
                        <SelectItem value="edit">Edit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-base font-medium text-foreground">Set module access</h2>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Access Template (Optional)</label>
                  <Select
                    value={selectedPermissionBundleId || "__none__"}
                    onValueChange={handleBundleSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No template</SelectItem>
                      {permissionBundles.map((bundle) => (
                        <SelectItem key={bundle.id} value={bundle.id}>
                          {bundle.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  {INVITE_MODULES.map((module) => (
                    <div
                      key={module.key}
                      className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{module.label}</p>
                        <p className="text-xs text-muted-foreground">{module.description}</p>
                      </div>
                      <Select
                        value={inviteModuleLevels[module.key]}
                        onValueChange={(value) =>
                          setInviteModuleLevels((current) => ({
                            ...current,
                            [module.key]: value as PermissionLevel,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full sm:w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVITE_LEVEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-base font-medium text-foreground">Set global scope</h2>
                <p className="text-sm text-muted-foreground">
                  Markets apply across both Assets and Products for this invite.
                </p>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Markets</label>
                  <MultiSelect
                    options={shareMarkets.map((market) => ({
                      value: market.id,
                      label: market.name,
                    }))}
                    value={selectedMarketIds}
                    onChange={setSelectedMarketIds}
                    placeholder="Select one or more markets"
                  />
                </div>
                {!isTeamInvite ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Sets (Optional)</label>
                    <MultiSelect
                      options={shareSets.map((set) => ({
                        value: set.id,
                        label: `[${set.module_key}] ${set.name}`,
                      }))}
                      value={selectedShareSetIds}
                      onChange={setSelectedShareSetIds}
                      placeholder="Select one or more sets to assign on invite acceptance"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Selected sets are granted to the partner automatically when the invite is accepted.
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-base font-medium text-foreground">Review and send</h2>
                <div className="rounded-md border border-border p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{email || "No email provided"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Shield className="h-4 w-4" />
                    <span>
                      {isTeamInvite ? `Team role: ${inviteRole}` : `Partner access: ${accessLevel}`}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground mb-2">Module levels</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {INVITE_MODULES.map((module) => (
                        <div key={module.key} className="rounded border border-border px-3 py-2 text-xs">
                          <div className="text-muted-foreground">{module.label}</div>
                          <div className="font-medium text-foreground">
                            {inviteModuleLevels[module.key]}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground mb-2">Market scopes</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedMarketIds.length > 0
                        ? `${selectedMarketIds.length} market(s) selected`
                        : "No markets selected"}
                    </p>
                  </div>
                  {!isTeamInvite ? (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-2">Assigned sets</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedShareSetIds.length > 0
                          ? `${selectedShareSetIds.length} set(s) selected`
                          : "No sets selected"}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </>
        )}

        {(configError || submitError) && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {configError || submitError}
          </div>
        )}

        {!inviteSuccess ? (
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={step === 1 ? () => router.push(`/${tenantSlug}/settings/team`) : handleBack}>
              {step === 1 ? "Cancel" : "Back"}
            </Button>
            {step < STEP_LABELS.length ? (
              <Button onClick={handleNext}>Continue</Button>
            ) : (
              <Button onClick={handleSendInvite} disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send Invite"}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <Check className="h-4 w-4" />
              <p className="text-sm font-medium">Invitation sent successfully.</p>
            </div>
            {inviteLink && (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="flex-1 rounded border border-emerald-300 bg-white px-3 py-2 text-xs"
                />
                <Button variant="outline" size="sm" onClick={handleCopyInviteLink}>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => router.push(`/${tenantSlug}/settings/team`)}>
                Back to Team
              </Button>
              <Button onClick={handleInviteAnother}>Invite Another</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
