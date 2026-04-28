export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  monthlyPriceCents?: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  activeSkuLimit?: number;
  storageLimitGb?: number;
  deliveryBandwidthLimitGb?: number;
  internalUserLimit?: number;
  userLimit?: number;
  partnerInviteLimit?: number;
  deeplTotalCharLimit?: number;
  agentRunLimit?: number;
  maxUploadBytes?: number;
  publicShareLinksEnabled?: boolean;
}

export interface Subscription {
  id: string;
  organizationId: string;
  planId: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Usage {
  organizationId: string;
  period: string; // YYYY-MM format
  storageUsed: number;
  storageLimitGb?: number;
  activeSkuCount?: number;
  internalUserCount?: number;
  partnerInviteCount?: number;
  translationCharCount?: number;
  writeCharCount?: number;
  deliveryBandwidthGb?: number;
  agentRunsCount?: number;
  assetsCount: number;
  downloadCount: number;
  uploadsCount: number;
}

export type BillingPlanId = "free" | "starter" | "growth" | "scale" | "enterprise";
