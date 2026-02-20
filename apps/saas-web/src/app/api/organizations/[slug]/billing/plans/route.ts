import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for small teams getting started',
    price: 29,
    currency: 'USD',
    interval: 'month' as const,
    features: [
      '5GB Storage',
      'Up to 5 users',
      'Basic Assets features',
      'Email support'
    ],
    storageLimit: 5 * 1024 * 1024 * 1024, // 5GB
    userLimit: 5,
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'For growing teams with advanced needs',
    price: 99,
    currency: 'USD',
    interval: 'month' as const,
    features: [
      '50GB Storage',
      'Up to 25 users',
      'Advanced Assets features',
      'API Access',
      'Priority support',
      'Custom metadata fields'
    ],
    storageLimit: 50 * 1024 * 1024 * 1024, // 50GB
    userLimit: 25,
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with custom requirements',
    price: 299,
    currency: 'USD',
    interval: 'month' as const,
    features: [
      '500GB Storage',
      'Unlimited users',
      'All features',
      'Dedicated support',
      'SSO integration',
      'Custom integrations',
      'Advanced analytics'
    ],
    storageLimit: 500 * 1024 * 1024 * 1024, // 500GB
    userLimit: -1, // unlimited
  },
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const resolvedParams = await params;

    const db = new DatabaseQueries(supabaseServer);
    const authService = new AuthService(db);
    
    const user = await authService.getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organization = await authService.getCurrentOrganization(resolvedParams.slug);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const hasAccess = await authService.hasOrganizationAccess(user.id, organization.id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      plans: PLANS,
      currentPlanId: PLANS.find(plan => plan.storageLimit >= organization.storageLimit)?.id || 'starter'
    });
  } catch (error) {
    console.error("Failed to get plans:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}