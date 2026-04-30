"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelect } from "@/components/ui/multi-select";
import { defaultInviteModuleLevels, type PermissionLevel } from "@/lib/invite-permissions";
import { SettingsPageContent } from "../../components/settings-page-content";

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
  scope_kind?: "product_scope" | "brand_library_scope";
};

type InviteConfigPayload = {
  success: boolean;
  data?: {
    organization_type?: "brand" | "partner";
    permission_bundles?: PermissionBundle[];
    markets?: ShareContainer[];
    share_sets?: ShareSetOption[];
    saved_scopes?: ShareSetOption[];
    output_profiles?: Array<{
      id: string;
      name: string;
      code: string;
      profile_type: string;
      is_primary: boolean;
    }>;
  };
  error?: string;
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
const INVITE_CONFIG_CACHE_TTL_MS = 30_000;
const inviteConfigCache = new Map<string, { expiresAt: number; payload: InviteConfigPayload }>();
const inviteConfigInFlight = new Map<string, Promise<InviteConfigPayload>>();

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getInviteConfigCacheKey(tenantSlug: string, invitationType: InvitationType): string {
  return `${tenantSlug}:${invitationType}`;
}

async function getInviteConfig(
  tenantSlug: string,
  invitationType: InvitationType
): Promise<InviteConfigPayload> {
  const cacheKey = getInviteConfigCacheKey(tenantSlug, invitationType);
  const now = Date.now();
  const cached = inviteConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const inFlight = inviteConfigInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const response = await fetch(
      `/api/${tenantSlug}/invites/config?invitation_type=${invitationType}`
    );

    const payload = (await response.json().catch(() => ({}))) as InviteConfigPayload;
    if (!response.ok) {
      throw new Error(payload?.error || "Failed to load invite configuration");
    }

    inviteConfigCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + INVITE_CONFIG_CACHE_TTL_MS,
    });

    return payload;
  })().finally(() => {
    inviteConfigInFlight.delete(cacheKey);
  });

  inviteConfigInFlight.set(cacheKey, request);
  return request;
}

export default function InviteWizardClient({
  tenantSlug,
  invitationType,
}: InviteWizardClientProps) {
  const router = useRouter();
  const isTeamInvite = invitationType === "team_member";
  const [organizationType, setOrganizationType] = useState<"brand" | "partner">("brand");

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteModuleLevels, setInviteModuleLevels] = useState<Record<InviteModuleKey, PermissionLevel>>({
    products: "view",
    assets: "view",
    share_links: "view",
  });
  const [shareMarkets, setShareMarkets] = useState<ShareContainer[]>([]);
  const [shareSets, setShareSets] = useState<ShareSetOption[]>([]);
  const [outputProfiles, setOutputProfiles] = useState<
    Array<{ id: string; name: string; code: string; profile_type: string; is_primary: boolean }>
  >([]);
  const [selectedOutputProfileIds, setSelectedOutputProfileIds] = useState<string[]>([]);
  const [selectedProductScopeIds, setSelectedProductScopeIds] = useState<string[]>([]);
  const [selectedBrandLibraryScopeIds, setSelectedBrandLibraryScopeIds] = useState<string[]>([]);
  const [permissionBundles, setPermissionBundles] = useState<PermissionBundle[]>([]);
  const [selectedPermissionBundleId, setSelectedPermissionBundleId] = useState("");

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const isPartnerWorkspace = organizationType === "partner";
  const title = isTeamInvite
    ? isPartnerWorkspace
      ? "Invite Teammate"
      : "Invite Team Member"
    : "Invite Partner";
  const description = isTeamInvite
    ? isPartnerWorkspace
      ? "Invite someone into this partner workspace with Admin, Editor, or Viewer access."
      : "Invite an internal workspace member and define their role and optional scoped access."
    : "Invite an external partner workspace to view published content in the Portal.";

  const currentDefaults = useMemo<Record<InviteModuleKey, PermissionLevel>>(
    () => {
      if (!isTeamInvite) {
        return { products: "none", assets: "none", share_links: "none" };
      }
      const defaults = defaultInviteModuleLevels({
        invitationType,
        role: inviteRole,
        accessLevel: "view",
      });
      return {
        products: defaults.products ?? "none",
        assets: defaults.assets ?? "none",
        share_links: defaults.share_links ?? "none",
      };
    },
    [invitationType, inviteRole, isTeamInvite]
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
      const configPayload = await getInviteConfig(tenantSlug, invitationType);
      const bundles = Array.isArray(configPayload?.data?.permission_bundles)
        ? configPayload.data.permission_bundles
        : [];
      const markets = Array.isArray(configPayload?.data?.markets)
        ? configPayload.data.markets
        : [];
      const savedScopes = Array.isArray(configPayload?.data?.saved_scopes)
        ? configPayload.data.saved_scopes
        : Array.isArray(configPayload?.data?.share_sets)
          ? configPayload.data.share_sets
          : [];
      const profiles = Array.isArray(configPayload?.data?.output_profiles)
        ? configPayload.data.output_profiles
        : [];

      setOrganizationType(configPayload?.data?.organization_type === "partner" ? "partner" : "brand");
      setPermissionBundles(bundles);
      setShareMarkets(markets);
      setOutputProfiles(profiles);
      setSelectedOutputProfileIds((current) => {
        const valid = current.filter((id) => profiles.some((profile) => profile.id === id));
        if (valid.length > 0) return valid;
        const primaryProfile = profiles.find((profile) => profile.is_primary);
        return primaryProfile?.id ? [primaryProfile.id] : profiles[0]?.id ? [profiles[0].id] : [];
      });

      const nextSets = isTeamInvite ? [] : savedScopes;
      setShareSets(nextSets);
      setSelectedProductScopeIds((current) =>
        current.filter((id) =>
          nextSets.some((set) => set.id === id && set.module_key === "products")
        )
      );
      setSelectedBrandLibraryScopeIds((current) =>
        current.filter((id) =>
          nextSets.some((set) => set.id === id && set.module_key === "assets")
        )
      );
    } catch (error: unknown) {
      setConfigError(error instanceof Error ? error.message : "Failed to load invite configuration");
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

    for (const rule of selectedBundle.rules || []) {
      if (rule.module_key in nextLevels) {
        nextLevels[rule.module_key] = rule.level;
      }
    }

    setInviteModuleLevels(nextLevels);
  };

  const canContinueFromStepOne = useMemo(() => {
    if (!email.trim() || !isValidEmail(email.trim())) return false;
    return true;
  }, [email]);

  const canContinueFromStepTwo = useMemo(() => {
    if (isTeamInvite) return true;
    if (outputProfiles.length === 0) return true;
    return selectedOutputProfileIds.length > 0;
  }, [isTeamInvite, outputProfiles.length, selectedOutputProfileIds.length]);

  const handleNext = () => {
    setSubmitError("");
    if (step === 1 && !canContinueFromStepOne) {
      setSubmitError("Enter a valid email address to continue.");
      return;
    }
    if (step === 2 && !canContinueFromStepTwo) {
      setSubmitError("Portal access is required to continue.");
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
      };

      if (isTeamInvite) {
        requestBody.permission_bundle_id = selectedPermissionBundleId || null;
        requestBody.invite_permissions = {
          module_levels: inviteModuleLevels,
          scopes: {
            market_ids: [],
            collection_ids: [],
          },
        };
        requestBody.role = inviteRole;
      } else {
        const selectedShareSetIds = [
          ...selectedProductScopeIds,
          ...selectedBrandLibraryScopeIds,
        ];
        requestBody.permission_bundle_id = null;
        requestBody.invite_permissions = {
          module_levels: {},
          scopes: {
            market_ids: [],
            collection_ids: [],
            output_profile_ids: selectedOutputProfileIds,
          },
        };
        requestBody.access_level = "view";
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
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : "Failed to send invitation");
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
    setSelectedPermissionBundleId("");
    setInviteModuleLevels({
      products: "view",
      assets: "view",
      share_links: "view",
    });
    setSelectedOutputProfileIds(
      outputProfiles.find((profile) => profile.is_primary)?.id
        ? [outputProfiles.find((profile) => profile.is_primary)!.id]
        : outputProfiles[0]?.id
          ? [outputProfiles[0].id]
          : []
    );
    setSelectedProductScopeIds([]);
    setSelectedBrandLibraryScopeIds([]);
    setInviteSuccess(false);
    setInviteLink("");
    setSubmitError("");
  };

  const productScopeOptions = useMemo(
    () => shareSets.filter((set) => set.module_key === "products"),
    [shareSets]
  );
  const brandLibraryScopeOptions = useMemo(
    () => shareSets.filter((set) => set.module_key === "assets"),
    [shareSets]
  );
  const selectedPortalProfile = useMemo(
    () =>
      outputProfiles.find((profile) => selectedOutputProfileIds.includes(profile.id)) ??
      outputProfiles[0] ??
      null,
    [outputProfiles, selectedOutputProfileIds]
  );

  return (
    <SettingsPageContent page="team-invite-wizard">
      <PageHeader
        title={title}
        description={description}
        backHref={`/${tenantSlug}/settings/team`}
        backLabel="Back to Team"
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
          <div className="space-y-4" aria-hidden="true">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-28" />
          </div>
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
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {isPartnerWorkspace ? "Teammate Role" : "Team Role"}
                    </label>
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
                  <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                    Partner invites are Portal-only and read-only. Editing remains available only for the partner workspace's own content after upgrade.
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-base font-medium text-foreground">
                  {isTeamInvite ? "Configure module access" : "Portal access"}
                </h2>
                {isTeamInvite ? (
                  <>
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
                  </>
                ) : (
                  <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Portal</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        This invite grants read-only Portal access to published brand content. Markets are inherited from the selected scopes, and launch no longer exposes separate destination or marketplace profile choices.
                      </p>
                    </div>
                    {selectedPortalProfile ? (
                      <p className="text-xs text-muted-foreground">
                        Active launch profile: {selectedPortalProfile.name}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      If no product scope is selected in the next step, this partner will receive the full published Portal catalog.
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-base font-medium text-foreground">Configure scope</h2>
                {isTeamInvite ? (
                  <p className="text-sm text-muted-foreground">
                    Market-scoped access for team invites continues to be handled through internal permissions and advanced access templates.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Product Scopes decide which products this partner can view. Brand Library Scopes add standalone files and folders that are not already included through product visibility.
                  </p>
                )}
                {!isTeamInvite ? (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Product Scopes (Optional)</label>
                      <MultiSelect
                        options={productScopeOptions.map((set) => ({
                          value: set.id,
                          label: set.name,
                        }))}
                        value={selectedProductScopeIds}
                        onChange={setSelectedProductScopeIds}
                        placeholder="Select product scopes"
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        Leave blank to grant the full published Portal catalog. Product scope access automatically includes linked product assets and documents.
                      </p>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Brand Library Scopes (Optional)</label>
                      <MultiSelect
                        options={brandLibraryScopeOptions.map((set) => ({
                          value: set.id,
                          label: set.name,
                        }))}
                        value={selectedBrandLibraryScopeIds}
                        onChange={setSelectedBrandLibraryScopeIds}
                        placeholder="Select brand library scopes"
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        Use Brand Library Scopes for standalone assets, folders, and files not already revealed through product scope access.
                      </p>
                    </div>
                    {shareMarkets.length > 0 ? (
                      <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                        Markets are configured on the scope definitions in Settings and are no longer granted separately in this invite flow.
                      </div>
                    ) : null}
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
                      {isTeamInvite
                        ? `${isPartnerWorkspace ? "Teammate" : "Team"} role: ${inviteRole}`
                        : "Partner access: portal viewer"}
                    </span>
                  </div>
                  {isTeamInvite ? (
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
                  ) : (
                    <>
                      <div>
                        <p className="text-xs font-medium text-foreground mb-2">Portal access</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedPortalProfile?.name || "Portal"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground mb-2">Product Scopes</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedProductScopeIds.length > 0
                            ? `${selectedProductScopeIds.length} selected`
                            : "Full published Portal catalog"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground mb-2">Brand Library Scopes</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedBrandLibraryScopeIds.length > 0
                            ? `${selectedBrandLibraryScopeIds.length} selected`
                            : "None selected"}
                        </p>
                      </div>
                    </>
                  )}
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
              <Button
                variant="outline"
                className="border-0 shadow-none"
                onClick={() => router.push(`/${tenantSlug}/settings/team`)}
              >
                Back to Team
              </Button>
              <Button onClick={handleInviteAnother}>Invite Another</Button>
            </div>
          </div>
        )}
      </div>
    </SettingsPageContent>
  );
}
