"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Loader2, Building2, Globe, Users, CheckCircle2, XCircle } from "lucide-react";
import { AuthLayoutShell } from "@tradetool/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSlugAvailability } from "@/hooks/useSlugAvailability";

interface CountryOption {
  code: string;
  name: string;
}

export default function OnboardingPage() {
  const tenantBaseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || "stackcess.com";
  const { user, isAuthenticated, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    companySlug: "",
    industry: "",
    teamSize: "",
    business_type: "brand",
    partner_category: "retailer",
    default_market_country_code: "US",
  });
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);

  const onboardingType = searchParams.get("type");
  const invitedPartnerCategory = searchParams.get("partner_category");
  const brandId = searchParams.get("brand_id");
  const accessLevel = searchParams.get("access_level") as "view" | "edit" | null;
  const invitationToken = searchParams.get("token");
  const hasPartnerInviteContext =
    typeof invitationToken === "string" &&
    invitationToken.trim().length > 0 &&
    typeof brandId === "string" &&
    brandId.trim().length > 0;
  const isPartnerOnboarding = onboardingType === "partner" || hasPartnerInviteContext;
  const isPartnerBusinessType = formData.business_type !== "brand";

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
    const fetchCountries = async () => {
      if (!isAuthenticated) return;

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

    fetchCountries();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isPartnerOnboarding) return;
    if (!invitedPartnerCategory) return;
    const normalized = invitedPartnerCategory.toLowerCase();
    if (!["retailer", "distributor", "wholesaler"].includes(normalized)) return;
    setFormData((prev) => ({ ...prev, partner_category: normalized }));
  }, [invitedPartnerCategory, isPartnerOnboarding]);

  const handleInputChange = (field: string, value: string) => {
    if (field === "companyName") {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      setFormData((prev) => ({
        ...prev,
        [field]: value,
        companySlug: slug,
      }));

      if (slug && slug.length >= 3) {
        clearSuggestions();
        checkAvailability(slug);
      }
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (field === "companySlug" && value && value.length >= 3) {
      clearSuggestions();
      checkAvailability(value);
    }
  };

  const handleSuggestionSelect = (selectedSlug: string) => {
    setFormData((prev) => ({
      ...prev,
      companySlug: selectedSlug,
    }));
    clearSuggestions();
    checkAvailability(selectedSlug);
  };

  const getSlugStatusIcon = () => {
    if (isCheckingAvailability) {
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }

    if (!availability) {
      return null;
    }

    if (availability.available) {
      return <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />;
    }

    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  const getSlugStatusMessage = () => {
    if (isCheckingAvailability) {
      return <span className="text-sm text-muted-foreground">Checking availability...</span>;
    }

    if (!availability) {
      return null;
    }

    if (availability.available) {
      return <span className="text-sm text-[var(--color-success)]">Available.</span>;
    }

    return (
      <div className="space-y-2">
        <span className="text-sm text-destructive">{availability.message}</span>
        {(availability.reason === "taken_supabase" || availability.reason === "taken_kinde") && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => getSuggestions(formData.companySlug, formData.companyName)}
            className="text-xs"
          >
            {isLoadingSuggestions ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Finding alternatives...
              </>
            ) : (
              "Suggest alternatives"
            )}
          </Button>
        )}
      </div>
    );
  };

  const handleCreateOrganization = async () => {
    setLoading(true);

    try {
      const organizationType = isPartnerOnboarding || isPartnerBusinessType ? "partner" : "brand";
      const partnerCategory =
        organizationType === "partner"
          ? (isPartnerOnboarding ? formData.partner_category : formData.business_type)
          : null;

      const requestBody = {
        name: formData.companyName,
        slug: formData.companySlug,
        industry: formData.industry,
        teamSize: formData.teamSize,
        default_market_country_code: formData.default_market_country_code,
        organization_type: organizationType,
        partner_category: partnerCategory,
      };

      if (isPartnerOnboarding && !invitationToken) {
        throw new Error("Missing invitation token for partner onboarding");
      }

      const response = await fetch("/api/workspaces/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      const createdOrgId = result.data?.organization?.id;
      const createdOrgSlug = result.data?.organization?.slug || formData.companySlug;

      if (isPartnerOnboarding && brandId && createdOrgId) {
        const relationshipResponse = await fetch("/api/partner-relationships/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            brand_organization_id: brandId,
            partner_organization_id: createdOrgId,
            access_level: accessLevel || "view",
            invitation_token: invitationToken,
          }),
        });

        if (!relationshipResponse.ok) {
          const relationshipError = await relationshipResponse.json().catch(() => ({}));
          throw new Error(relationshipError.error || "Failed to create brand-partner relationship");
        }
      }

      router.push(`/${createdOrgSlug}`);
    } catch (error) {
      console.error("Organization creation error:", error);

      if (error instanceof Error) {
        alert(`Organization creation failed: ${error.message}`);
      } else {
        alert("Organization creation failed: Unknown error");
      }

      router.push("/demo-org");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <AuthLayoutShell
        authContext={{ isAuthenticated: false }}
        headerProps={{ className: "hidden" }}
        contentClassName="pt-0"
      >
        <div className="flex min-h-screen items-center justify-center px-4 py-12">
          <Card className="w-full max-w-[520px] rounded-2xl border border-muted/30 bg-white shadow-sm">
            <CardContent className="px-6 py-8 sm:px-8">
              <div className="text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-muted/30 bg-white">
                  <Image src="/stackcess-icon-wb-logo.svg" alt="STACKCESS" width={32} height={32} className="h-8 w-8" />
                </div>
                <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-foreground" />
                <p className="text-[var(--font-size-sm)] text-muted-foreground">Preparing your workspace...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AuthLayoutShell>
    );
  }

  if (step === 1) {
    return (
      <AuthLayoutShell
        authContext={{ isAuthenticated: false }}
        headerProps={{ className: "hidden" }}
        contentClassName="pt-0"
      >
        <div className="flex min-h-screen items-center justify-center px-4 py-12">
          <Card className="w-full max-w-[520px] rounded-2xl border border-muted/30 bg-white shadow-sm">
            <CardHeader className="space-y-3 px-6 pb-4 pt-8 text-left sm:px-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-muted/30 bg-white">
                <Image src="/stackcess-icon-wb-logo.svg" alt="STACKCESS" width={32} height={32} className="h-8 w-8" />
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">STACKCESS</span>
              <h1 className="text-[var(--font-size-2xl)] font-semibold leading-tight tracking-tight text-foreground">
                Welcome{user?.given_name ? `, ${user.given_name}` : ""}!
              </h1>
              <p className="text-[var(--font-size-sm)] text-muted-foreground">
                {isPartnerOnboarding
                  ? "Create your partner organization to access brand content"
                  : "Let's set up your organization's digital asset workspace"}
              </p>
            </CardHeader>

            <CardContent className="space-y-5 px-6 pb-8 pt-0 sm:px-8">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {isPartnerOnboarding ? "Partner Organization Name" : "Workspace Name"}
                </label>
                <Input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange("companyName", e.target.value)}
                  placeholder={isPartnerOnboarding ? "GNC" : "Acme Corporation"}
                  className="h-12 rounded-[0.5rem]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  {isPartnerOnboarding ? "Partner URL" : "Workspace URL"}
                </label>
                <div className="flex items-center">
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      value={formData.companySlug}
                      onChange={(e) => handleInputChange("companySlug", e.target.value)}
                      placeholder="acme"
                      className={cn(
                        "h-12 rounded-r-none border-r-0 pr-10",
                        availability?.available === false
                          ? "border-red-300"
                          : availability?.available === true
                            ? "border-green-300"
                            : "border-muted/30"
                      )}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">{getSlugStatusIcon()}</div>
                  </div>
                  <div className="inline-flex h-12 items-center rounded-r-[0.5rem] border border-l-0 border-muted/30 bg-muted/40 px-4 text-sm text-muted-foreground">
                    .{tenantBaseDomain}
                  </div>
                </div>

                <div className="mt-2 min-h-[20px]">{getSlugStatusMessage()}</div>

                {suggestions.length > 0 && (
                  <div className="mt-3 rounded-lg border border-muted/30 bg-muted/30 p-3">
                    <p className="mb-2 text-sm font-medium text-foreground">Available alternatives:</p>
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

                <p className="mt-1 text-xs text-muted-foreground">This will be your organization's unique URL.</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Industry</label>
                <Select value={formData.industry} onValueChange={(value) => handleInputChange("industry", value)}>
                  <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplements">Supplements and Nutrition</SelectItem>
                    <SelectItem value="sports">Sports and Fitness</SelectItem>
                    <SelectItem value="wellness">Health and Wellness</SelectItem>
                    <SelectItem value="retail">Retail and Distribution</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!isPartnerOnboarding && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Business Type</label>
                  <Select
                    value={formData.business_type}
                    onValueChange={(value) => handleInputChange("business_type", value)}
                  >
                    <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brand">Brand (recommended for content owners)</SelectItem>
                      <SelectItem value="retailer">Retailer</SelectItem>
                      <SelectItem value="distributor">Distributor</SelectItem>
                      <SelectItem value="wholesaler">Wholesaler</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This sets your default workspace experience and permission model.
                  </p>
                </div>
              )}

              {isPartnerOnboarding && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Partner Business Type
                  </label>
                  <Select
                    value={formData.partner_category}
                    onValueChange={(value) => handleInputChange("partner_category", value)}
                  >
                    <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                      <SelectValue placeholder="Select business type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retailer">Retailer</SelectItem>
                      <SelectItem value="distributor">Distributor</SelectItem>
                      <SelectItem value="wholesaler">Wholesaler</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This determines partner workflow defaults and permission presets.
                  </p>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Team Size</label>
                <Select value={formData.teamSize} onValueChange={(value) => handleInputChange("teamSize", value)}>
                  <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                    <SelectValue placeholder="Select team size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-5">1-5 people</SelectItem>
                    <SelectItem value="6-20">6-20 people</SelectItem>
                    <SelectItem value="21-50">21-50 people</SelectItem>
                    <SelectItem value="51-200">51-200 people</SelectItem>
                    <SelectItem value="200+">200+ people</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Primary Market</label>
                <Select
                  value={formData.default_market_country_code}
                  onValueChange={(value) => handleInputChange("default_market_country_code", value)}
                >
                  <SelectTrigger className="h-12 rounded-[0.5rem] px-4">
                    <SelectValue placeholder={countriesLoading ? "Loading markets..." : "Select primary market"} />
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
                  We will create this as your default market and seed its primary language.
                </p>
              </div>

              <Button
                onClick={() => setStep(2)}
                disabled={
                  !formData.companyName ||
                  !formData.companySlug ||
                  !availability?.available ||
                  isCheckingAvailability ||
                  (!isPartnerOnboarding && !formData.business_type) ||
                  (isPartnerOnboarding && !formData.partner_category) ||
                  !formData.default_market_country_code
                }
                className="mt-3 h-12 w-full rounded-[0.5rem] text-base font-semibold"
                size="lg"
              >
                {isCheckingAvailability ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking availability...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
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
        <Card className="w-full max-w-[520px] rounded-2xl border border-muted/30 bg-white shadow-sm">
          <CardHeader className="space-y-3 px-6 pb-4 pt-8 text-left sm:px-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-muted/30 bg-white">
              <Image src="/stackcess-icon-wb-logo.svg" alt="STACKCESS" width={40} height={40} className="h-10 w-10" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">STACKCESS</span>
            <CardTitle className="text-[var(--font-size-2xl)] font-semibold leading-tight tracking-tight">Ready to create {formData.companyName}?</CardTitle>
            <p className="text-[var(--font-size-sm)] text-muted-foreground">We'll set up your digital asset management workspace.</p>
          </CardHeader>

          <CardContent className="space-y-4 px-6 pb-8 pt-0 sm:px-8">
            <div className="rounded-xl border border-muted/30 bg-muted/30 p-6 text-left">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-foreground" />
                  <div>
                    <div className="font-medium text-foreground">{formData.companySlug}.{tenantBaseDomain}</div>
                    <div className="text-sm text-muted-foreground">Your workspace URL</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-foreground" />
                  <div>
                    <div className="font-medium text-foreground">{formData.companyName}</div>
                    <div className="text-sm text-muted-foreground">Organization name</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-foreground" />
                  <div>
                    <div className="font-medium text-foreground">{formData.teamSize} team</div>
                    <div className="text-sm text-muted-foreground">{formData.industry}</div>
                  </div>
                </div>
                {(isPartnerOnboarding || formData.business_type) && (
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-foreground" />
                    <div>
                      <div className="font-medium text-foreground">
                        {(isPartnerOnboarding ? formData.partner_category : formData.business_type)
                          .charAt(0)
                          .toUpperCase() +
                          (isPartnerOnboarding ? formData.partner_category : formData.business_type).slice(1)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {isPartnerOnboarding ? "Partner business type" : "Business type"}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-foreground" />
                  <div>
                    <div className="font-medium text-foreground">
                      {countries.find((country) => country.code === formData.default_market_country_code)?.name || formData.default_market_country_code}
                    </div>
                    <div className="text-sm text-muted-foreground">Default market</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleCreateOrganization}
                disabled={loading}
                className="h-12 w-full rounded-[0.5rem] text-base font-semibold"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating workspace...
                  </>
                ) : (
                  "Create Organization"
                )}
              </Button>

              <Button
                onClick={() => setStep(1)}
                variant="ghost"
                className="h-12 w-full rounded-[0.5rem] text-base font-semibold"
              >
                Back to edit
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthLayoutShell>
  );
}
