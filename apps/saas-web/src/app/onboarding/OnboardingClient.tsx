"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Package,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { AuthLayoutShell } from "@stack-app/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSlugAvailability } from "@/hooks/useSlugAvailability";
import { SUPPORTED_UI_LOCALES, UI_LOCALE_LABELS } from "@/lib/ui-locales";

interface CountryOption {
  code: string;
  name: string;
}

interface LocaleOption {
  code: string;
  name: string;
}

export default function OnboardingPage() {
  const t = useTranslations("Onboarding");
  const tenantBaseDomain = (
    process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || "stackcess.com"
  ).replace(/^https?:\/\//, "");
  const { user, isAuthenticated, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showWorkspaceDefaults, setShowWorkspaceDefaults] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    companySlug: "",
    industry: "supplements",
    teamSize: "1-5",
    business_type: "brand",
    partner_category: "retailer",
    default_content_locale_code: "en-US",
    default_market_country_code: "US",
    default_ui_locale: "en-US",
  });
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [contentLocales, setContentLocales] = useState<LocaleOption[]>([]);
  const [contentLocalesLoading, setContentLocalesLoading] = useState(false);

  const onboardingType = searchParams.get("type");
  const invitedPartnerCategory = searchParams.get("partner_category");
  const brandId = searchParams.get("brand_id");
  const accessLevel = searchParams.get("access_level") as "view" | "edit" | null;
  const invitationToken = searchParams.get("token");
  const returnTo = searchParams.get("return_to");
  const planInterest = searchParams.get("plan_interest");
  const hasPartnerInviteContext =
    typeof invitationToken === "string" &&
    invitationToken.trim().length > 0 &&
    typeof brandId === "string" &&
    brandId.trim().length > 0;
  const isPartnerOnboarding =
    onboardingType === "partner" || hasPartnerInviteContext;
  const isPartnerBusinessType = formData.business_type !== "brand";
  const isKitShareFlow =
    isPartnerOnboarding &&
    typeof returnTo === "string" &&
    returnTo.startsWith("/u/");

  const {
    availability,
    isCheckingAvailability,
    suggestions,
    isLoadingSuggestions,
    checkAvailability,
    getSuggestions,
    clearSuggestions,
  } = useSlugAvailability();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isKitShareFlow) return;
    if (!isAuthenticated) return;

    const fetchCountries = async () => {
      try {
        setCountriesLoading(true);
        const response = await fetch("/api/reference/countries");
        if (!response.ok) return;
        const data = await response.json();
        setCountries(Array.isArray(data) ? data : []);
      } catch (error) {
        console.warn("Failed to fetch countries for onboarding", error);
      } finally {
        setCountriesLoading(false);
      }
    };

    const fetchContentLocales = async () => {
      try {
        setContentLocalesLoading(true);
        const response = await fetch("/api/reference/locales");
        if (!response.ok) return;
        const data = await response.json();
        setContentLocales(Array.isArray(data) ? data : []);
      } catch (error) {
        console.warn("Failed to fetch content locales for onboarding", error);
      } finally {
        setContentLocalesLoading(false);
      }
    };

    fetchCountries();
    fetchContentLocales();
  }, [isAuthenticated, isKitShareFlow]);

  useEffect(() => {
    if (!isPartnerOnboarding) return;
    if (!invitedPartnerCategory) return;
    const normalized = invitedPartnerCategory.toLowerCase();
    if (!["retailer", "distributor", "wholesaler"].includes(normalized)) return;
    setFormData((prev) => ({ ...prev, partner_category: normalized }));
  }, [invitedPartnerCategory, isPartnerOnboarding]);

  const handleInputChange = (field: string, value: string) => {
    setSubmitError(null);

    if (field === "companyName") {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      setFormData((prev) => ({ ...prev, [field]: value, companySlug: slug }));

      if (slug.length >= 3) {
        clearSuggestions();
        checkAvailability(slug);
      }
      return;
    }

    setFormData((prev) => ({ ...prev, [field]: value }));

    if (field === "companySlug" && value.length >= 3) {
      clearSuggestions();
      checkAvailability(value);
    }
  };

  const handleSuggestionSelect = (selectedSlug: string) => {
    setFormData((prev) => ({ ...prev, companySlug: selectedSlug }));
    clearSuggestions();
    checkAvailability(selectedSlug);
  };

  const getSlugStatusIcon = () => {
    if (isCheckingAvailability) return <LoadingSkeleton size="sm" />;
    if (!availability) return null;
    if (availability.available) {
      return <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />;
    }
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  const getSlugStatusMessage = () => {
    if (isCheckingAvailability) {
      return (
        <span className="text-sm text-muted-foreground">{t("slug.checking")}</span>
      );
    }
    if (!availability) return null;
    if (availability.available) {
      return (
        <span className="text-sm text-[var(--color-success)]">
          {t("slug.available")}
        </span>
      );
    }
    return (
      <div className="space-y-2">
        <span className="text-sm text-destructive">{availability.message}</span>
        {(availability.reason === "taken_supabase" ||
          availability.reason === "taken_kinde") && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => getSuggestions(formData.companySlug, formData.companyName)}
            className="text-xs"
          >
            {isLoadingSuggestions ? (
              <>
                <LoadingSkeleton size="sm" className="mr-1" />
                {t("slug.findingAlternatives")}
              </>
            ) : (
              t("slug.suggestAlternatives")
            )}
          </Button>
        )}
      </div>
    );
  };

  const handleCreateOrganization = async () => {
    setLoading(true);
    setSubmitError(null);

    try {
      const organizationType =
        isPartnerOnboarding || isPartnerBusinessType ? "partner" : "brand";
      const partnerCategory =
        organizationType === "partner"
          ? isPartnerOnboarding
            ? formData.partner_category
            : formData.business_type
          : null;

      const response = await fetch("/api/workspaces/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.companyName,
          slug: formData.companySlug,
          industry: formData.industry || "other",
          teamSize: formData.teamSize || "1-5",
          default_content_locale_code: formData.default_content_locale_code,
          default_market_country_code: formData.default_market_country_code,
          default_ui_locale: formData.default_ui_locale,
          organization_type: organizationType,
          partner_category: partnerCategory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Server error while creating workspace (${response.status})`
        );
      }

      const result = await response.json();
      const createdOrgId = result.data?.organization?.id;
      const createdOrgSlug = result.data?.organization?.slug || formData.companySlug;
      const createdKindeOrgId = result.data?.organization?.kinde_org_id as string | undefined;

      if (isPartnerOnboarding && brandId && createdOrgId) {
        const relationshipResponse = await fetch("/api/partner-relationships/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand_organization_id: brandId,
            partner_organization_id: createdOrgId,
            access_level: accessLevel || "view",
            invitation_token: invitationToken,
          }),
        });

        if (!relationshipResponse.ok) {
          const err = await relationshipResponse.json().catch(() => ({}));
          throw new Error(err.error || t("errors.failedToConnectPartner"));
        }
      }

      if (returnTo && returnTo.startsWith("/u/")) {
        router.push(returnTo);
        return;
      }

      const isSelfServePartnerWorkspace =
        organizationType === "partner" && !hasPartnerInviteContext;
      const billingSource = isSelfServePartnerWorkspace ? "partner_signup" : "signup";
      const validPlans = ["free", "starter", "growth", "scale"];
      const planParam =
        planInterest && validPlans.includes(planInterest.toLowerCase())
          ? `&plan_intent=${encodeURIComponent(planInterest.toLowerCase())}`
          : "";
      const billingUrl = `/${createdOrgSlug}/settings/billing?source=${billingSource}${planParam}`;

      if (createdKindeOrgId) {
        // Force a token refresh scoped to the new org so billing permissions are active
        window.location.assign(
          `/api/auth/login?org_code=${encodeURIComponent(createdKindeOrgId)}&post_login_redirect_url=${encodeURIComponent(billingUrl)}`
        );
      } else {
        router.push(billingUrl);
      }
    } catch (error) {
      console.error("Organization creation error:", error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : t("errors.workspaceCreateFailed")
      );
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    !isLoading &&
    isAuthenticated &&
    !loading &&
    formData.companyName.trim().length > 0 &&
    formData.companySlug.trim().length >= 3 &&
    availability?.available === true &&
    !isCheckingAvailability &&
    (!isPartnerOnboarding || formData.partner_category.trim().length > 0);

  if (isKitShareFlow) {
    return (
      <AuthLayoutShell
        authContext={{ isAuthenticated: false }}
        headerProps={{ className: "hidden" }}
        contentClassName="pt-0"
      >
        <div className="flex min-h-screen items-center justify-center px-4 py-12">
          <Card className="w-full max-w-[480px] rounded-2xl border-0 bg-white shadow-none">
            <CardHeader className="space-y-3 px-6 pb-4 pt-8 text-left sm:px-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-muted/30 bg-white">
                <Package className="h-6 w-6 text-foreground" />
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
                STACKCESS
              </span>
              <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground">
                {t("kitFlow.title")}
              </h1>
              <p className="text-sm text-muted-foreground">{t("kitFlow.subtitle")}</p>
            </CardHeader>

            <CardContent className="space-y-5 px-6 pb-8 pt-0 sm:px-8">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {t("fields.organizationName")}
                </label>
                <Input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange("companyName", e.target.value)}
                  placeholder={t("kitFlow.organizationPlaceholder")}
                  className="h-12 rounded-[0.5rem]"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {t("fields.workspaceUrl")}
                </label>
                <div className="flex items-center">
                  <div className="inline-flex h-12 items-center rounded-l-[0.5rem] border border-r-0 border-muted/30 bg-muted/40 px-4 text-sm text-muted-foreground whitespace-nowrap">
                    {tenantBaseDomain}/
                  </div>
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      value={formData.companySlug}
                      onChange={(e) => handleInputChange("companySlug", e.target.value)}
                      placeholder="acme"
                      className={cn(
                        "h-12 rounded-l-none border-l-0 pr-10",
                        availability?.available === false
                          ? "border-red-300"
                          : availability?.available === true
                            ? "border-green-300"
                            : "border-muted/30"
                      )}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {getSlugStatusIcon()}
                    </div>
                  </div>
                </div>
                <div className="mt-2 min-h-[20px]">{getSlugStatusMessage()}</div>
                {suggestions.length > 0 && (
                  <div className="mt-3 rounded-lg border border-muted/30 bg-muted/30 p-3">
                    <p className="mb-2 text-sm font-medium text-foreground">
                      {t("slug.alternatives")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((suggestion, index) => (
                        <Button
                          key={index}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleSuggestionSelect(suggestion)}
                          className="h-8 text-xs"
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {submitError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {submitError}
                </div>
              )}

              <Button
                onClick={() => void handleCreateOrganization()}
                disabled={!canSubmit}
                className="mt-2 h-12 w-full rounded-[0.5rem] text-base font-semibold"
                size="lg"
              >
                {loading ? (
                  <>
                    <LoadingSkeleton size="sm" className="mr-2" />
                    {t("actions.creatingWorkspace")}
                  </>
                ) : isLoading ? (
                  <>
                    <LoadingSkeleton size="sm" className="mr-2" />
                    {t("actions.loading")}
                  </>
                ) : (
                  t("kitFlow.createAndAccess")
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                {t("kitFlow.freeHint")}
              </p>
            </CardContent>
          </Card>
        </div>
      </AuthLayoutShell>
    );
  }

  return (
    <AuthLayoutShell
      authContext={{ isAuthenticated: false }}
      headerProps={{ className: "hidden" }}
      contentClassName="pt-0"
    >
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-[520px] rounded-2xl border-0 bg-white shadow-none">
          <CardHeader className="space-y-3 px-6 pb-4 pt-8 text-left sm:px-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-muted/30 bg-white">
              <Image
                src="/stackcess-icon-wb-logo.svg"
                alt="STACKCESS"
                width={32}
                height={32}
                className="h-8 w-8"
              />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              STACKCESS
            </span>
            <CardTitle className="text-[var(--font-size-2xl)] font-semibold leading-tight tracking-tight">
              {user?.given_name
                ? t("hero.welcomeWithName", { name: user.given_name })
                : t("hero.welcome")}
            </CardTitle>
            <p className="text-[var(--font-size-sm)] text-muted-foreground">
              {hasPartnerInviteContext
                ? t("hero.subtitlePartnerInvite")
                : isPartnerOnboarding
                  ? t("hero.subtitlePartner")
                  : t("hero.subtitleBrand")}
            </p>
          </CardHeader>

          <CardContent className="space-y-5 px-6 pb-8 pt-0 sm:px-8">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                {isPartnerOnboarding
                  ? t("fields.partnerOrganizationName")
                  : t("fields.workspaceName")}
              </label>
              <Input
                type="text"
                value={formData.companyName}
                onChange={(e) => handleInputChange("companyName", e.target.value)}
                placeholder={
                  isPartnerOnboarding
                    ? t("placeholders.partnerOrganizationName")
                    : t("placeholders.workspaceName")
                }
                className="h-12 rounded-[0.5rem]"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                {isPartnerOnboarding ? t("fields.partnerUrl") : t("fields.workspaceUrl")}
              </label>
              <div className="flex items-center">
                <div className="inline-flex h-12 items-center rounded-l-[0.5rem] border border-r-0 border-muted/30 bg-muted/40 px-4 text-sm text-muted-foreground whitespace-nowrap">
                  {tenantBaseDomain}/
                </div>
                <div className="relative flex-1">
                  <Input
                    type="text"
                    value={formData.companySlug}
                    onChange={(e) => handleInputChange("companySlug", e.target.value)}
                    placeholder="acme"
                    className={cn(
                      "h-12 rounded-l-none border-l-0 pr-10",
                      availability?.available === false
                        ? "border-red-300"
                        : availability?.available === true
                          ? "border-green-300"
                          : "border-muted/30"
                    )}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {getSlugStatusIcon()}
                  </div>
                </div>
              </div>
              <div className="mt-2 min-h-[20px]">{getSlugStatusMessage()}</div>
              {suggestions.length > 0 && (
                <div className="mt-3 rounded-lg border border-muted/30 bg-muted/30 p-3">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {t("slug.alternatives")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion, index) => (
                      <Button
                        key={index}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleSuggestionSelect(suggestion)}
                        className="h-8 text-xs"
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {t("fields.workspaceUrlHint")}
              </p>
            </div>

            {isPartnerOnboarding ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {t("fields.partnerBusinessType")}
                </label>
                <Select
                  value={formData.partner_category}
                  onValueChange={(value) =>
                    handleInputChange("partner_category", value)
                  }
                >
                  <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                    <SelectValue placeholder={t("fields.selectBusinessType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retailer">
                      {t("businessTypeOptions.retailer")}
                    </SelectItem>
                    <SelectItem value="distributor">
                      {t("businessTypeOptions.distributor")}
                    </SelectItem>
                    <SelectItem value="wholesaler">
                      {t("businessTypeOptions.wholesaler")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {t("fields.businessType")}
                </label>
                <Select
                  value={formData.business_type}
                  onValueChange={(value) => handleInputChange("business_type", value)}
                >
                  <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                    <SelectValue placeholder={t("fields.selectBusinessType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brand">
                      {t("businessTypeOptions.brand")}
                    </SelectItem>
                    <SelectItem value="retailer">
                      {t("businessTypeOptions.retailer")}
                    </SelectItem>
                    <SelectItem value="distributor">
                      {t("businessTypeOptions.distributor")}
                    </SelectItem>
                    <SelectItem value="wholesaler">
                      {t("businessTypeOptions.wholesaler")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rounded-lg border border-muted/30">
              <button
                type="button"
                onClick={() => setShowWorkspaceDefaults((prev) => !prev)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("optionalDefaults.title")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("optionalDefaults.hint")}
                  </p>
                </div>
                {showWorkspaceDefaults ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {showWorkspaceDefaults && (
                <div className="space-y-4 border-t border-muted/30 px-4 py-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t("fields.industry")}
                    </label>
                    <Select
                      value={formData.industry}
                      onValueChange={(value) => handleInputChange("industry", value)}
                    >
                      <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                        <SelectValue placeholder={t("fields.selectIndustry")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supplements">
                          {t("industryOptions.supplements")}
                        </SelectItem>
                        <SelectItem value="sports">
                          {t("industryOptions.sports")}
                        </SelectItem>
                        <SelectItem value="wellness">
                          {t("industryOptions.wellness")}
                        </SelectItem>
                        <SelectItem value="retail">
                          {t("industryOptions.retail")}
                        </SelectItem>
                        <SelectItem value="other">
                          {t("industryOptions.other")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t("fields.teamSize")}
                    </label>
                    <Select
                      value={formData.teamSize}
                      onValueChange={(value) => handleInputChange("teamSize", value)}
                    >
                      <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                        <SelectValue placeholder={t("fields.selectTeamSize")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-5">
                          {t("teamSizeOptions.1-5")}
                        </SelectItem>
                        <SelectItem value="6-20">
                          {t("teamSizeOptions.6-20")}
                        </SelectItem>
                        <SelectItem value="21-50">
                          {t("teamSizeOptions.21-50")}
                        </SelectItem>
                        <SelectItem value="51-200">
                          {t("teamSizeOptions.51-200")}
                        </SelectItem>
                        <SelectItem value="200+">
                          {t("teamSizeOptions.200+")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Default content locale
                    </label>
                    <Select
                      value={formData.default_content_locale_code}
                      onValueChange={(value) =>
                        handleInputChange("default_content_locale_code", value)
                      }
                    >
                      <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                        <SelectValue
                          placeholder={
                            contentLocalesLoading
                              ? "Loading locales..."
                              : "Select default content locale"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {contentLocales.length === 0 && (
                          <SelectItem value="en-US">English (United States)</SelectItem>
                        )}
                        {contentLocales.map((locale) => (
                          <SelectItem key={locale.code} value={locale.code}>
                            {locale.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This sets the default content baseline for Product Detail, adaptation, and syndication.
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t("fields.primaryMarket")}
                    </label>
                    <Select
                      value={formData.default_market_country_code}
                      onValueChange={(value) =>
                        handleInputChange("default_market_country_code", value)
                      }
                    >
                      <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                        <SelectValue
                          placeholder={
                            countriesLoading
                              ? t("fields.loadingMarkets")
                              : t("fields.selectPrimaryMarket")
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {countries.length === 0 && (
                          <SelectItem value="US">United States (US)</SelectItem>
                        )}
                        {countries.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name} ({country.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("fields.primaryMarketHint")}
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      {t("fields.workspaceLanguage")}
                    </label>
                    <Select
                      value={formData.default_ui_locale}
                      onValueChange={(value) =>
                        handleInputChange("default_ui_locale", value)
                      }
                    >
                      <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                        <SelectValue
                          placeholder={t("fields.selectWorkspaceLanguage")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_UI_LOCALES.map((localeCode) => (
                          <SelectItem key={localeCode} value={localeCode}>
                            {UI_LOCALE_LABELS[localeCode]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("fields.workspaceLanguageHint")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {submitError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <Button
              onClick={() => void handleCreateOrganization()}
              disabled={!canSubmit}
              className="h-12 w-full rounded-[0.5rem] text-base font-semibold"
              size="lg"
            >
              {loading ? (
                <>
                  <LoadingSkeleton size="sm" className="mr-2" />
                  {t("actions.creatingWorkspace")}
                </>
              ) : isCheckingAvailability ? (
                <>
                  <LoadingSkeleton size="sm" className="mr-2" />
                  {t("slug.checking")}
                </>
              ) : isPartnerOnboarding ? (
                t("actions.createPartnerWorkspace")
              ) : (
                t("actions.createWorkspace")
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              {t("footer.noCreditCardHint")}
            </p>
          </CardContent>
        </Card>
      </div>
    </AuthLayoutShell>
  );
}
