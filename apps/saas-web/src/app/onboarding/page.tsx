"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Building2, Globe, Users, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthLayoutShell } from "@tradetool/ui";
import { useAuth } from "@/hooks/useAuth";
import { useSlugAvailability } from "@/hooks/useSlugAvailability";

export default function OnboardingPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    companySlug: "",
    industry: "",
    teamSize: "",
  });
  const router = useRouter();
  
  // Slug availability checking
  const { 
    availability, 
    isCheckingAvailability, 
    suggestions, 
    isLoadingSuggestions,
    checkAvailability, 
    getSuggestions, 
    clearSuggestions,
    isAvailable 
  } = useSlugAvailability();

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleInputChange = (field: string, value: string) => {
    if (field === "companyName") {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      
      // Update both fields in single state update
      setFormData(prev => ({
        ...prev,
        [field]: value,
        companySlug: slug
      }));
      
      // Check availability immediately if slug is valid
      if (slug && slug.length >= 3) {
        clearSuggestions();
        checkAvailability(slug);
      }
    } else {
      // For other fields (including manual slug edits)
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
      
      // Check availability when manually editing slug
      if (field === "companySlug" && value && value.length >= 3) {
        clearSuggestions();
        checkAvailability(value);
      }
    }
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (selectedSlug: string) => {
    setFormData(prev => ({
      ...prev,
      companySlug: selectedSlug
    }));
    clearSuggestions();
    checkAvailability(selectedSlug);
  };

  // Get status icon for slug availability
  const getSlugStatusIcon = () => {
    if (isCheckingAvailability) {
      return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
    }
    
    if (!availability) {
      return null;
    }
    
    if (availability.available) {
      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    } else {
      return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  // Get status message
  const getSlugStatusMessage = () => {
    if (isCheckingAvailability) {
      return <span className="text-gray-500 text-sm">Checking availability...</span>;
    }
    
    if (!availability) {
      return null;
    }
    
    if (availability.available) {
      return <span className="text-green-600 text-sm">✓ Available!</span>;
    } else {
      return (
        <div className="space-y-2">
          <span className="text-red-600 text-sm">{availability.message}</span>
          {availability.reason === 'taken_supabase' || availability.reason === 'taken_kinde' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => getSuggestions(formData.companySlug, formData.companyName)}
              className="text-xs"
            >
              {isLoadingSuggestions ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  Finding alternatives...
                </>
              ) : (
                'Suggest alternatives'
              )}
            </Button>
          ) : null}
        </div>
      );
    }
  };

  const handleCreateOrganization = async () => {
    setLoading(true);
    
    try {
      // Create organization with collected data
      const response = await fetch("/api/workspaces/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.companyName,
          slug: formData.companySlug,
          industry: formData.industry,
          teamSize: formData.teamSize,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      
      // Direct navigation - hybrid auth in tenant layout handles access verification
      console.log('✅ Workspace created successfully, navigating to:', `/${formData.companySlug}`)
      router.push(`/${formData.companySlug}`);
      
    } catch (error) {
      console.error("Organization creation error:", error);
      
      // Show the actual error to help debug
      if (error instanceof Error) {
        alert(`Organization creation failed: ${error.message}`);
      } else {
        alert("Organization creation failed: Unknown error");
      }
      
      // For demo, redirect to demo-org anyway
      router.push("/demo-org");
    } finally {
      setLoading(false);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <AuthLayoutShell authContext={{ isAuthenticated: false }}>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 4rem)' }}>
          <Card className="max-w-lg w-full shadow-xl border-0">
            <CardContent className="pt-8 pb-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <Image 
                    src="/stackcess-icon-wb-logo.svg" 
                    alt="STACKCESS" 
                    width={32}
                    height={32}
                    className="w-8 h-8"
                  />
                </div>
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-4 text-slate-600" />
                <p className="text-slate-600 text-sm">Loading...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AuthLayoutShell>
    );
  }

  if (step === 1) {
    return (
      <AuthLayoutShell authContext={{ isAuthenticated: false }}>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 4rem)' }}>
          <Card className="max-w-lg w-full shadow-xl border-0">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Image 
                  src="/stackcess-icon-wb-logo.svg" 
                  alt="STACKCESS" 
                  width={32}
                  height={32}
                  className="w-8 h-8"
                />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                Welcome{user?.given_name ? `, ${user.given_name}` : ''}!
              </h1>
              <p className="text-slate-600 text-sm leading-relaxed">
                Let's set up your organization's digital asset workspace
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange("companyName", e.target.value)}
                    placeholder="Acme Corporation"
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-white text-slate-900 transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Workspace URL
                  </label>
                  <div className="flex items-center">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={formData.companySlug}
                        onChange={(e) => handleInputChange("companySlug", e.target.value)}
                        placeholder="acme"
                        className={`w-full px-4 py-3 pr-10 border rounded-l-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 bg-white text-slate-900 transition-all duration-200 ${
                          availability?.available === false ? 'border-red-300' : 
                          availability?.available === true ? 'border-green-300' : 
                          'border-slate-200'
                        }`}
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        {getSlugStatusIcon()}
                      </div>
                    </div>
                    <div className="px-4 py-3 bg-slate-50 border border-l-0 border-slate-200 rounded-r-lg text-slate-500 text-sm">
                      .stackcess.com
                    </div>
                  </div>
                  
                  {/* Status message */}
                  <div className="mt-2 min-h-[20px]">
                    {getSlugStatusMessage()}
                  </div>
                  
                  {/* Suggestions */}
                  {suggestions.length > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-medium text-blue-800 mb-2">Available alternatives:</p>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleSuggestionSelect(suggestion)}
                            className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-md transition-colors duration-200 border border-blue-300"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-slate-500 mt-1">This will be your organization's unique URL</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Industry
                  </label>
                  <select
                    value={formData.industry}
                    onChange={(e) => handleInputChange("industry", e.target.value)}
                    className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-primary bg-background text-foreground transition-all duration-200"
                  >
                    <option value="">Select industry</option>
                    <option value="supplements">Supplements & Nutrition</option>
                    <option value="sports">Sports & Fitness</option>
                    <option value="wellness">Health & Wellness</option>
                    <option value="retail">Retail & Distribution</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Team Size
                  </label>
                  <select
                    value={formData.teamSize}
                    onChange={(e) => handleInputChange("teamSize", e.target.value)}
                    className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-primary bg-background text-foreground transition-all duration-200"
                  >
                    <option value="">Select team size</option>
                    <option value="1-5">1-5 people</option>
                    <option value="6-20">6-20 people</option>
                    <option value="21-50">21-50 people</option>
                    <option value="51-200">51-200 people</option>
                    <option value="200+">200+ people</option>
                  </select>
                </div>
              </div>

              <Button
                onClick={() => setStep(2)}
                disabled={
                  !formData.companyName || 
                  !formData.companySlug || 
                  !availability?.available ||
                  isCheckingAvailability
                }
                className="w-full mt-8 rounded-full"
                size="lg"
              >
                {isCheckingAvailability ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Checking availability...
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </AuthLayoutShell>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      <Card className="max-w-md w-full mx-auto sm:max-w-lg">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg border border-border/20">
            <Image 
              src="/stackcess-icon-wb-logo.svg" 
              alt="STACKCESS" 
              width={40}
              height={40}
              className="w-10 h-10"
            />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Ready to create {formData.companyName}?</CardTitle>
          <p className="text-muted-foreground text-base leading-relaxed">We'll set up your digital asset management workspace.</p>
        </CardHeader>
        
        <CardContent>
          <div className="bg-gradient-to-br from-muted/50 to-muted rounded-xl p-6 mb-8 text-left border border-border/50">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-medium text-foreground">{formData.companySlug}.stackcess.com</div>
                  <div className="text-sm text-muted-foreground">Your workspace URL</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-medium text-foreground">{formData.companyName}</div>
                  <div className="text-sm text-muted-foreground">Organization name</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-medium text-foreground">{formData.teamSize} team</div>
                  <div className="text-sm text-muted-foreground">{formData.industry}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleCreateOrganization}
              disabled={loading}
              className="w-full rounded-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating workspace...
                </>
              ) : (
                "Create Organization"
              )}
            </Button>
            
            <Button
              onClick={() => setStep(1)}
              variant="ghost"
              className="w-full"
            >
              Back to edit
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}