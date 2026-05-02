'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, HardDrive, Languages, Package, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageSkeleton } from '@/components/ui/loading-skeleton';
import { SettingsPageContent } from './settings-page-content';
import type { Subscription, SubscriptionPlan, Usage } from '@stack-app/types';
import { isUnlimitedBillingLimit } from '@/lib/billing-policy';

interface BillingSettingsProps {
  tenantSlug: string;
  source?: string;
  planIntent?: string;
  checkoutStatus?: string;
}

type SubscriptionResponse = {
  subscription: Subscription;
  plan: SubscriptionPlan;
  usage: Usage;
};

type PlansResponse = {
  plans: SubscriptionPlan[];
  currentPlanId: string;
};

type MeterCard = {
  key: string;
  label: string;
  icon: React.ReactNode;
  usage: number;
  limit: number | null;
  unit: string;
};

const PLAN_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  growth: 2,
  scale: 3,
  enterprise: 4,
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.max(0, value));
}

function formatMoney(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function toGb(bytes: number | undefined): number {
  if (!bytes || !Number.isFinite(bytes)) return 0;
  return bytes / (1024 * 1024 * 1024);
}

function meterPercent(usage: number, limit: number | null): number {
  if (!limit || limit <= 0 || isUnlimitedBillingLimit(limit)) return 0;
  return Math.min(100, Math.max(0, (usage / limit) * 100));
}

function meterTone(percent: number): 'success' | 'warning' | 'error' {
  if (percent >= 100) return 'error';
  if (percent >= 80) return 'warning';
  return 'success';
}

export default function BillingSettings({ tenantSlug, source, planIntent, checkoutStatus }: BillingSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState<string | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  const fetchPlansData = useCallback(async () => {
    setPlansLoading(true);
    try {
      const plansResponse = await fetch(`/api/organizations/${tenantSlug}/billing/plans`);
      if (!plansResponse.ok) throw new Error('Failed to load billing plans');
      const plansPayload = (await plansResponse.json()) as PlansResponse;
      setPlans(plansPayload.plans || []);
      setCurrentPlanId((current) => plansPayload.currentPlanId || current);
    } catch (fetchError) {
      console.error('Failed to load billing plans:', fetchError);
    } finally {
      setPlansLoading(false);
    }
  }, [tenantSlug]);

  const fetchBillingData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSubscription(null);
      setSubscriptionPlan(null);
      setUsage(null);
      setCurrentPlanId(null);
      setPlans([]);

      void fetchPlansData();

      const subscriptionResponse = await fetch(`/api/organizations/${tenantSlug}/billing/subscription`);
      if (!subscriptionResponse.ok) throw new Error('Failed to load subscription');

      const subscriptionPayload = (await subscriptionResponse.json()) as SubscriptionResponse;
      setSubscription(subscriptionPayload.subscription);
      setSubscriptionPlan(subscriptionPayload.plan || null);
      setUsage(subscriptionPayload.usage);
      setCurrentPlanId(subscriptionPayload.subscription?.planId || null);
    } catch (fetchError) {
      console.error('Failed to load billing settings:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load billing settings');
    } finally {
      setLoading(false);
    }
  }, [fetchPlansData, tenantSlug]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  // Auto-open portal for paid plan intent from marketing links
  useEffect(() => {
    if (!planIntent || planIntent === 'free') return;
    if (loading || plansLoading) return;
    handleOpenPortal(planIntent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, plansLoading]);

  const handleOpenPortal = async (intentPlanId?: string) => {
    try {
      setOpeningPortal(intentPlanId || 'manage');
      setError(null);

      const planParam = intentPlanId && intentPlanId !== 'manage' ? `?plan=${intentPlanId}` : '';
      const response = await fetch(`/api/organizations/${tenantSlug}/billing/portal${planParam}`);

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to open billing portal');
      }

      const payload = (await response.json()) as { portalUrl?: string };
      if (!payload.portalUrl) throw new Error('Billing portal URL was not returned');
      window.location.assign(payload.portalUrl);
    } catch (portalError) {
      console.error('Failed to open billing portal:', portalError);
      setError(portalError instanceof Error ? portalError.message : 'Unable to open billing portal');
    } finally {
      setOpeningPortal(null);
    }
  };

  const handleContactSales = () => {
    window.location.href = 'mailto:sales@stackcess.com?subject=Enterprise%20Plan%20Inquiry';
  };

  const isFreePlan = !currentPlanId || currentPlanId === 'free';

  const activePlan = useMemo(() => {
    if (!plans.length) return subscriptionPlan;
    return plans.find((plan) => plan.id === currentPlanId) || plans[0] || null;
  }, [plans, currentPlanId, subscriptionPlan]);

  const currentPlanRank = currentPlanId ? (PLAN_RANK[currentPlanId] ?? -1) : -1;
  const nextDateLabel = subscription?.cancelAtPeriodEnd ? 'Ends on' : 'Next bill date';

  const meterCards = useMemo<MeterCard[]>(() => {
    const storageUsageGb = Number(toGb(usage?.storageUsed).toFixed(3));
    return [
      {
        key: 'active_sku_count',
        label: 'Active SKUs',
        icon: <Package className="h-4 w-4" />,
        usage: Number(usage?.activeSkuCount || 0),
        limit: activePlan?.activeSkuLimit ?? null,
        unit: '',
      },
      {
        key: 'storage_gb',
        label: 'Storage',
        icon: <HardDrive className="h-4 w-4" />,
        usage: storageUsageGb,
        limit: activePlan?.storageLimitGb ?? usage?.storageLimitGb ?? null,
        unit: 'GB',
      },
      {
        key: 'delivery_bandwidth_gb',
        label: 'Monthly delivery',
        icon: <CreditCard className="h-4 w-4" />,
        usage: Number(usage?.deliveryBandwidthGb || 0),
        limit: activePlan?.deliveryBandwidthLimitGb ?? null,
        unit: 'GB',
      },
      {
        key: 'internal_user_count',
        label: 'Internal users',
        icon: <Users className="h-4 w-4" />,
        usage: Number(usage?.internalUserCount || 0),
        limit: activePlan?.internalUserLimit ?? null,
        unit: '',
      },
      {
        key: 'partner_invite_count',
        label: 'Partner invites',
        icon: <Users className="h-4 w-4" />,
        usage: Number(usage?.partnerInviteCount || 0),
        limit: activePlan?.partnerInviteLimit ?? null,
        unit: '',
      },
      {
        key: 'ai_tasks',
        label: 'AI Tasks',
        icon: <Languages className="h-4 w-4" />,
        usage: Number(usage?.translationCharCount || 0),
        limit: activePlan?.deeplTotalCharLimit ?? null,
        unit: '',
      },
    ];
  }, [activePlan, usage]);

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageSkeleton text="Loading billing..." size="lg" />
      </div>
    );
  }

  return (
    <SettingsPageContent page="billing">

      {/* Payment success banner */}
      {checkoutStatus === 'success' && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-4">
          <p className="text-base font-semibold text-green-900">Payment successful!</p>
          <p className="text-sm text-green-800 mt-0.5">
            Your plan is being activated — this page will reflect your new subscription shortly.
          </p>
        </div>
      )}

      {/* Post-signup banner */}
      {source === 'signup' && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-green-900">Your workspace is ready</p>
              <p className="text-sm text-green-800 mt-0.5">
                {planIntent && planIntent !== 'free'
                  ? `Opening the ${planIntent.charAt(0).toUpperCase() + planIntent.slice(1)} plan for you…`
                  : "You're on the Free plan. Choose a paid plan below to unlock more SKUs, storage, and team seats."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Post-partner-signup banner */}
      {source === 'partner_signup' && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-blue-900">Partner workspace created</p>
              <p className="text-xs text-blue-800">
                Invited brand content remains free. Upgrade this workspace to unlock full partner features.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your plan, track usage, and update payment details.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Current plan card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your active subscription for this workspace.</CardDescription>
            </div>
            {!isFreePlan && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenPortal('manage')}
                disabled={Boolean(openingPortal)}
                className="shrink-0"
              >
                {openingPortal === 'manage' ? 'Opening…' : 'Manage Subscription'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Plan</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-base font-semibold">{activePlan?.name || 'Free (Sandbox)'}</span>
              {isFreePlan && (
                <Badge variant="secondary">Free</Badge>
              )}
              {subscription?.cancelAtPeriodEnd && (
                <Badge variant="warning">Cancelling</Badge>
              )}
            </div>
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="mt-1 text-sm font-medium capitalize">
              {isFreePlan ? 'Active' : (subscription?.status || '-')}
            </div>
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">{nextDateLabel}</div>
            <div className="mt-1 text-sm font-medium">
              {isFreePlan ? '—' : formatDate(subscription?.currentPeriodEnd)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage meters */}
      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>Current usage against your plan limits this billing period.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {meterCards.map((meter) => {
            const limit = meter.limit && isUnlimitedBillingLimit(meter.limit) ? null : meter.limit;
            const percent = meterPercent(meter.usage, limit);
            const formattedUsage =
              meter.unit === 'GB' ? meter.usage.toFixed(2) : formatNumber(meter.usage);
            const formattedLimit =
              limit == null
                ? 'Unlimited'
                : meter.unit === 'GB'
                  ? `${limit.toFixed(0)} ${meter.unit}`
                  : formatNumber(limit);

            // Free plan shows 0 for AI Tasks — show "Not included" instead of a bar
            const isNotIncluded = limit === 0;

            return (
              <div key={meter.key} className="rounded-md border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {meter.icon}
                    {meter.label}
                  </div>
                  {isNotIncluded ? (
                    <Badge variant="secondary">Not included</Badge>
                  ) : (
                    <Badge variant={meterTone(percent)}>
                      {limit == null ? 'Unlimited' : `${percent.toFixed(0)}%`}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {isNotIncluded ? (
                    <span>Upgrade to a paid plan to unlock</span>
                  ) : (
                    <>
                      {formattedUsage}
                      {meter.unit ? ` ${meter.unit}` : ''} / {formattedLimit}
                    </>
                  )}
                </div>
                {!isNotIncluded && limit != null && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
                    <div
                      className={`h-full transition-all ${
                        percent >= 100
                          ? 'bg-destructive'
                          : percent >= 80
                            ? 'bg-amber-500'
                            : 'bg-primary'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Plan options */}
      <Card>
        <CardHeader>
          <CardTitle>{isFreePlan ? 'Upgrade Your Plan' : 'Plans'}</CardTitle>
          <CardDescription>
            {isFreePlan
              ? 'Choose a paid plan to unlock more SKUs, storage, users, and AI features.'
              : 'Switch or manage your subscription through the Stripe portal.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {plansLoading ? (
            <div className="rounded-md border border-border/60 p-4 text-sm text-muted-foreground">
              Loading plans…
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-md border border-border/60 p-4 text-sm text-muted-foreground">
              No plans available right now.
            </div>
          ) : plans
              .filter((plan) => plan.id !== 'free') // Never show the free plan card here
              .map((plan) => {
                const isCurrent = plan.id === currentPlanId;
                const isOpening = openingPortal === plan.id;
                const isEnterprise = plan.id === 'enterprise';
                const planRank = PLAN_RANK[plan.id] ?? -1;
                const isDowngrade = !isCurrent && !isFreePlan && planRank < currentPlanRank;

                // Free users: Upgrade to Checkout for that plan
                // Paid users: all actions go through Stripe Customer Portal
                const buttonLabel = isEnterprise
                  ? 'Contact Sales'
                  : isCurrent
                    ? 'Current Plan'
                    : isFreePlan
                      ? `Upgrade to ${plan.name}`
                      : isDowngrade
                        ? 'Switch Plan'
                        : 'Switch Plan';

                const buttonVariant: 'default' | 'secondary' | 'outline' =
                  isEnterprise
                    ? 'default'
                    : isCurrent
                      ? 'outline'
                      : isFreePlan && !isDowngrade
                        ? 'default'
                        : 'secondary';

                const handleClick = () => {
                  if (isEnterprise) return handleContactSales();
                  if (isCurrent && !isFreePlan) return handleOpenPortal('manage');
                  // Free users go to Checkout for the selected plan; paid users go to Portal
                  return handleOpenPortal(isFreePlan ? plan.id : 'manage');
                };

                return (
                  <div
                    key={plan.id}
                    className={`rounded-md border p-4 ${
                      isCurrent
                        ? 'border-primary/50 bg-primary/5'
                        : isEnterprise
                          ? 'border-border/60'
                          : 'border-border/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-semibold">{plan.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {plan.price > 0
                            ? `${formatMoney(plan.price, plan.currency)} / ${plan.interval}`
                            : 'Custom pricing'}
                        </div>
                      </div>
                      {isCurrent ? <Badge>Current</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                    <ul className="mt-3 space-y-1 text-sm text-foreground">
                      {plan.features.slice(0, 5).map((feature) => (
                        <li key={feature} className="flex items-start gap-1.5">
                          <span className="mt-0.5 text-muted-foreground">–</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4">
                      <Button
                        variant={buttonVariant}
                        className="w-full"
                        disabled={isEnterprise ? false : (isCurrent && isFreePlan) || Boolean(openingPortal)}
                        onClick={handleClick}
                      >
                        {!isEnterprise && isOpening ? 'Opening…' : buttonLabel}
                      </Button>
                    </div>
                  </div>
                );
              })}
        </CardContent>
      </Card>

    </SettingsPageContent>
  );
}
