"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Check, X, Clock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

const AUTO_ACCEPT_STORAGE_KEY = "stackcess:auto-accept-invitation";

interface InvitationDetails {
  email: string;
  organizationName: string;
  organizationKindeId?: string;
  organizationSlug?: string;
  invitationType: 'team_member' | 'partner';
  requiresOnboarding?: boolean;
  brandSlug?: string | null;
  role: string;
  inviterEmail?: string;
  expiresAt: string;
}

type AcceptSuccessPayload = {
  invitation_type: "team_member" | "partner";
  requires_onboarding?: boolean;
  invitation_token?: string;
  invitation_id?: string;
  brand_organization_id?: string;
  brand_organization_slug?: string | null;
  partner_organization?: {
    id: string;
    name?: string | null;
    slug?: string | null;
  } | null;
  organization?: {
    id: string;
    name?: string | null;
    slug?: string | null;
    redirect_url?: string | null;
  } | null;
  access_level?: string | null;
  needs_profile?: boolean;
  profile_redirect_url?: string | null;
  redirect_url?: string | null;
};

type AcceptResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  data?: AcceptSuccessPayload;
  requireLogin?: boolean;
  requireReauth?: boolean;
  login_hint?: string;
};

type AcceptOptions = {
  auto?: boolean;
};

export default function InvitationAcceptClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const isBrowser = typeof window !== "undefined";

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [profileRequired, setProfileRequired] = useState(false);
  const [showSwitchAccount, setShowSwitchAccount] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link");
      setLoading(false);
      return;
    }

    fetchInvitation();
  }, [token]);

  // Only run when invitation is loaded

  const fetchInvitation = async () => {
    try {
      const response = await fetch(`/api/invitations/accept?token=${token}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to load invitation");
      }

      const data = await response.json();

      // Handle both data.invitation and data.data.invitation structures
      const invitationData = data.data?.invitation || data.invitation;

      if (!invitationData) {
        throw new Error("Invalid invitation data received");
      }

      setInvitation({
        email: invitationData.email,
        organizationName: invitationData.organization?.name || "Unknown Organization",
        organizationKindeId: invitationData.organization?.kinde_org_id,
        organizationSlug: invitationData.organization?.slug,
        invitationType: invitationData.type || invitationData.invitation_type || 'team_member',
        requiresOnboarding: invitationData.requires_onboarding ?? false,
        brandSlug: invitationData.organization?.slug,
        role: invitationData.role,
        inviterEmail: invitationData.inviterEmail,
        expiresAt: invitationData.expires_at || invitationData.expiresAt,
      });
    } catch (err: any) {
      console.error("Error fetching invitation:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const beginAuthFlow = useCallback(
    (options?: { forceFresh?: boolean; loginHint?: string | null }) => {
      if (!isBrowser) return;

      sessionStorage.setItem(AUTO_ACCEPT_STORAGE_KEY, "1");

      const params = new URLSearchParams();
      if (options?.loginHint) {
        params.set("login_hint", options.loginHint);
      }
      if (options?.forceFresh) {
        params.set("prompt", "login");
      }

      const destination = params.toString()
        ? `/api/auth/login?${params.toString()}`
        : `/api/auth/login`;

      window.location.href = destination;
    },
    [isBrowser]
  );

  const handleAccept = useCallback(
    async ({ auto = false }: AcceptOptions = {}) => {
      if (!token) {
        setError("Invalid invitation link");
        return;
      }

      if (isBrowser) {
        sessionStorage.removeItem(AUTO_ACCEPT_STORAGE_KEY);
      }

      setAccepting(true);
      setError(null);
      if (!auto) {
        setMessage(null);
      }
      setDeclined(false);
      setAccepted(false);
      setShowSwitchAccount(false);
      setNextUrl(null);
      setProfileRequired(false);

      try {
        const response = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitation_token: token }),
        });

        const data: AcceptResponse = await response
          .json()
          .catch(() => ({} as AcceptResponse));

        if (response.status === 401) {
          const loginHint = data.login_hint || invitation?.email || undefined;

          if (data.requireReauth) {
            beginAuthFlow({ forceFresh: true, loginHint });
            return;
          }

          if (data.requireLogin) {
            beginAuthFlow({ loginHint });
            return;
          }

          setError(data.message || "Please log in to accept this invitation.");
          setAccepting(false);
          return;
        }

        if (response.status === 403) {
          setShowSwitchAccount(true);
          setError(
            data.message ||
              `You're signed in as a different user. Please switch to ${invitation?.email ?? "the invited account"}.`
          );
          setAccepting(false);
          return;
        }

        if (!response.ok) {
          throw new Error(
            data.error || data.message || "Failed to accept invitation"
          );
        }

        const payload = data.data;
        if (!payload) {
          throw new Error(data.message || "Missing invitation response data");
        }

        setAccepted(true);
        setAccepting(false);
        setMessage(data.message || null);

        let destination: string | null = null;
        let profileFirst = false;

        if (payload.invitation_type === "partner") {
          if (payload.requires_onboarding) {
            const params = new URLSearchParams();
            params.set("type", "partner");
            if (payload.brand_organization_id) {
              params.set("brand_id", payload.brand_organization_id);
            }
            if (payload.access_level) {
              params.set("access_level", payload.access_level);
            }
            params.set("token", payload.invitation_token ?? token ?? "");
            destination =
              payload.redirect_url || `/onboarding?${params.toString()}`;
          } else {
            if (payload.needs_profile && payload.profile_redirect_url) {
              profileFirst = true;
              destination = payload.profile_redirect_url;
            } else {
              destination =
                payload.redirect_url ||
                payload.profile_redirect_url ||
                (payload.partner_organization?.slug
                  ? `/${payload.partner_organization.slug}/products`
                  : null);
            }
          }
        } else {
          if (payload.needs_profile && payload.profile_redirect_url) {
            profileFirst = true;
            destination = payload.profile_redirect_url;
          } else {
            destination =
              payload.organization?.redirect_url ||
              payload.redirect_url ||
              (payload.organization?.slug
                ? `/${payload.organization.slug}`
                : null);
          }
        }

        if (profileFirst && !data.message) {
          setMessage("Almost there - let's finish setting up your profile.");
        }

        setProfileRequired(profileFirst);
        setNextUrl(destination);
      } catch (err: any) {
        setError(err.message);
        setAccepting(false);
      }
    },
    [token, invitation, beginAuthFlow, isBrowser]
  );

  useEffect(() => {
    if (!invitation || !token || !isBrowser) {
      return;
    }

    const shouldResume = sessionStorage.getItem(AUTO_ACCEPT_STORAGE_KEY);
    if (
      shouldResume === "1" &&
      !accepting &&
      !accepted &&
      !declining &&
      !error
    ) {
      sessionStorage.removeItem(AUTO_ACCEPT_STORAGE_KEY);
      handleAccept({ auto: true });
    }
  }, [invitation, token, isBrowser, accepting, accepted, declining, error, handleAccept]);

  useEffect(() => {
    if (!accepted || !nextUrl || !isBrowser) {
      return;
    }

    const timeout = window.setTimeout(() => {
      window.location.href = nextUrl;
    }, profileRequired ? 800 : 1400);

    return () => window.clearTimeout(timeout);
  }, [accepted, nextUrl, profileRequired, isBrowser]);

  const handleSwitchAccount = useCallback(() => {
    beginAuthFlow({ forceFresh: true, loginHint: invitation?.email || undefined });
  }, [beginAuthFlow, invitation?.email]);

  const handleDecline = async () => {
    if (!token) {
      setError('Invalid invitation link');
      return;
    }

    setDeclining(true);
    setError(null);
    setMessage(null);
    setShowSwitchAccount(false);

    try {
      const response = await fetch(`/api/invitations/accept?token=${token}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to decline invitation');
      }

      setDeclined(true);
      setMessage(data.message || 'Invitation declined.');
      setAccepted(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeclining(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
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
      case "admin":
        return "Full access to manage team and all content";
      case "editor":
        return "Create and edit products and assets";
      case "viewer":
        return "View and download content";
      default:
        return "";
    }
  };

  if (loading || accepting || declining) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-background rounded-lg border border-border shadow-soft p-8">
            <div className="flex flex-col items-center space-y-4">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <h2 className="text-xl font-semibold text-foreground">
                {accepting ? 'Joining organization...' : 'Loading...'}
              </h2>
              <p className="text-sm text-muted-foreground text-center">
                {accepting ? 'Please wait while we set up your access' : 'Fetching invitation details'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-background rounded-lg border border-border shadow-soft p-8">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground">
                Welcome aboard!
              </h1>
              <p className="text-muted-foreground">
                {message ||
                  (profileRequired
                    ? "Almost there - let's finish setting up your profile."
                    : `You've successfully joined ${invitation?.organizationName}. Redirecting you now...`)}
              </p>
              {nextUrl && (
                <p className="text-xs text-muted-foreground">
                  Redirecting to {profileRequired ? "your welcome setup" : "your workspace"}...
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-background rounded-lg border border-border shadow-soft p-8">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <X className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground">
                Invitation Declined
              </h1>
              <p className="text-muted-foreground">
                {message || 'You have declined this invitation. The workspace owner will be notified.'}
              </p>
              <Button
                variant="outline"
                onClick={() => router.push("/")}
                className="mt-4"
              >
                Go to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-background rounded-lg border border-border shadow-soft p-8">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <X className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground">
                Invalid Invitation
              </h1>
              <p className="text-muted-foreground">
                {error || "This invitation link is invalid or has expired."}
              </p>
              {showSwitchAccount ? (
                <div className="mt-4 flex w-full gap-2">
                  <Button onClick={handleSwitchAccount} className="flex-1">
                    Switch Account
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/")}
                    className="flex-1"
                  >
                    Go to Home
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => router.push("/")}
                  className="mt-4"
                >
                  Go to Home
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-background rounded-lg border border-border shadow-soft p-8">
          <div className="flex flex-col space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground">
                You've been invited!
              </h1>
              <p className="text-muted-foreground">
                Join {invitation.organizationName}
              </p>
            </div>

            {/* Invitation Details */}
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Organization</span>
                  <span className="text-sm font-medium text-foreground">
                    {invitation.organizationName}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Your Role</span>
                  <span
                    className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${getRoleBadgeColor(
                      invitation.role
                    )}`}
                  >
                    {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
                  </span>
                </div>

                {invitation.inviterEmail && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Invited by</span>
                    <span className="text-sm font-medium text-foreground">
                      {invitation.inviterEmail}
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-muted-foreground flex-shrink-0">Permissions</span>
                  <span className="text-sm text-foreground text-right">
                    {getRoleDescription(invitation.role)}
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                onClick={() => handleAccept()}
                disabled={accepting || declining}
                className="w-full"
                size="lg"
              >
                {accepting ? "Processing..." : "Accept Invitation"}
              </Button>

              <Button
                variant="outline"
                onClick={handleDecline}
                disabled={accepting || declining}
                className="w-full"
              >
                {declining ? "Declining..." : "Decline"}
              </Button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-center text-blue-800">
                Click "Accept Invitation" to verify your email and join.
                You'll receive a one-time code to sign in - no password needed!
              </p>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              By accepting, you'll be able to access this organization and its content
              according to your assigned role.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
