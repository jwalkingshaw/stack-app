'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, HardDrive, Package, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/loading-spinner';
import { PageContentContainer } from '@/components/ui/page-content-container';
import type { Subscription, SubscriptionPlan, Usage } from '@tradetool/types';

interface BillingSettingsProps {
  tenantSlug: string;
  source?: string;
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
  if (!limit || limit <= 0 || limit >= Number.MAX_SAFE_INTEGER) return 0;
  return Math.min(100, Math.max(0, (usage / limit) * 100));
}

function meterTone(percent: number): 'default' | 'secondary' | 'destructive' {
  if (percent >= 100) return 'destructive';
  if (percent >= 80) return 'secondary';
  return 'default';
}

export default function BillingSettings({ tenantSlug, source }: BillingSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState<string | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  const fetchBillingData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const [subscriptionResponse, plansResponse] = await Promise.all([
        fetch(`/api/organizations/${tenantSlug}/billing/subscription`),
        fetch(`/api/organizations/${tenantSlug}/billing/plans`),
      ]);

      if (!subscriptionResponse.ok) {
        throw new Error('Failed to load subscription');
      }
      if (!plansResponse.ok) {
        throw new Error('Failed to load billing plans');
      }

      const subscriptionPayload = (await subscriptionResponse.json()) as SubscriptionResponse;
      const plansPayload = (await plansResponse.json()) as PlansResponse;

      setSubscription(subscriptionPayload.subscription);
      setUsage(subscriptionPayload.usage);
      setPlans(plansPayload.plans || []);
      setCurrentPlanId(plansPayload.currentPlanId || subscriptionPayload.subscription?.planId || null);
    } catch (fetchError) {
      console.error('Failed to load billing settings:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load billing settings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  const handleOpenPortal = async (intentPlanId?: string) => {
    try {
      setOpeningPortal(intentPlanId || 'manage');
      setError(null);

      const response = await fetch(`/api/organizations/${tenantSlug}/billing/portal`);

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to open billing portal');
      }

      const payload = (await response.json()) as { portalUrl?: string };
      if (!payload.portalUrl) {
        throw new Error('Billing portal URL was not returned');
      }
      window.location.assign(payload.portalUrl);
    } catch (portalError) {
      console.error('Failed to open billing portal:', portalError);
      setError(portalError instanceof Error ? portalError.message : 'Unable to open billing portal');
    } finally {
      setOpeningPortal(null);
    }
  };

  const activePlan = useMemo(() => {
    if (!plans.length) return null;
    return plans.find((plan) => plan.id === currentPlanId) || plans[0] || null;
  }, [plans, currentPlanId]);

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
    ];
  }, [activePlan, usage]);

  if (loading) {
    return (
      <div className="h-full bg-background">
        <PageLoader text="Loading billing..." size="lg" />
      </div>
    );
  }

  return (
    <PageContentContainer mode="content" className="space-y-6">
      {source === 'partner_signup' && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-blue-900">Partner workspace created</p>
              <p className="text-xs text-blue-800">
                Invited brand content remains free. Upgrade this workspace to unlock full partner features for your own products and assets.
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleOpenPortal()}
              disabled={Boolean(openingPortal)}
            >
              {openingPortal === 'manage' ? 'Opening...' : 'Upgrade Workspace'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Manage plans, track usage caps, and control subscription status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => handleOpenPortal()}
            disabled={Boolean(openingPortal)}
          >
            {openingPortal === 'manage' ? 'Opening...' : 'Manage Plan'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchBillingData(true)} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current Subscription</CardTitle>
          <CardDescription>Core subscription status for this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Plan</div>
            <div className="mt-1 text-base font-semibold">{activePlan?.name || '-'}</div>
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="mt-1">
              <Badge variant={subscription?.status === 'past_due' ? 'destructive' : 'default'}>
                {subscription?.status || 'active'}
              </Badge>
            </div>
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Current period start</div>
            <div className="mt-1 text-sm font-medium">{formatDate(subscription?.currentPeriodStart)}</div>
          </div>
          <div className="rounded-md border border-border/60 p-3">
            <div className="text-xs text-muted-foreground">Current period end</div>
            <div className="mt-1 text-sm font-medium">{formatDate(subscription?.currentPeriodEnd)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage Against Plan Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {meterCards.map((meter) => {
            const limit = meter.limit && meter.limit >= Number.MAX_SAFE_INTEGER ? null : meter.limit;
            const percent = meterPercent(meter.usage, limit);
            const formattedUsage =
              meter.unit === 'GB' ? meter.usage.toFixed(2) : formatNumber(meter.usage);
            const formattedLimit =
              limit == null
                ? 'Unlimited'
                : meter.unit === 'GB'
                  ? `${limit.toFixed(0)} ${meter.unit}`
                  : formatNumber(limit);

            return (
              <div key={meter.key} className="rounded-md border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {meter.icon}
                    {meter.label}
                  </div>
                  <Badge variant={meterTone(percent)}>
                    {limit == null ? 'Unlimited' : `${percent.toFixed(0)}%`}
                  </Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {formattedUsage}
                  {meter.unit ? ` ${meter.unit}` : ''} / {formattedLimit}
                </div>
                {limit != null && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
                    <div
                      className={`h-full ${
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

      <Card>
        <CardHeader>
          <CardTitle>Plan Options</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isOpening = openingPortal === plan.id;

            return (
              <div
                key={plan.id}
                className={`rounded-md border p-4 ${
                  isCurrent ? 'border-primary/50 bg-primary/5' : 'border-border/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-semibold">{plan.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {plan.price > 0 ? `${formatMoney(plan.price, plan.currency)} / ${plan.interval}` : 'Custom'}
                    </div>
                  </div>
                  {isCurrent ? <Badge>Current</Badge> : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                <ul className="mt-3 space-y-1 text-sm text-foreground">
                  {plan.features.slice(0, 5).map((feature) => (
                    <li key={feature}>- {feature}</li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Button
                    variant={isCurrent ? 'secondary' : 'default'}
                    size="sm"
                    disabled={Boolean(openingPortal)}
                    onClick={() => handleOpenPortal(plan.id)}
                  >
                    {isOpening
                      ? 'Opening...'
                      : isCurrent
                        ? 'Manage in Portal'
                        : `Upgrade in Portal`}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </PageContentContainer>
  );
}
