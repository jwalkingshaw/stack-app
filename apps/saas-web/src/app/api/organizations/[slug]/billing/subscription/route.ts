import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@tradetool/auth";
import { DatabaseQueries } from "@tradetool/database";
import { supabaseServer } from "@/lib/supabase";

// Mock subscription plans
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for small teams getting started',
    price: 29,
    currency: 'USD',
    interval: 'month' as const,
    features: ['5GB Storage', 'Up to 5 users', 'Basic Assets features'],
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
    features: ['50GB Storage', 'Up to 25 users', 'Advanced Assets features', 'API Access'],
    storageLimit: 50 * 1024 * 1024 * 1024, // 50GB
    userLimit: 25,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with custom requirements',
    price: 299,
    currency: 'USD',
    interval: 'month' as const,
    features: ['500GB Storage', 'Unlimited users', 'All features', 'Priority support'],
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

    // For now, return a mock subscription based on storage limit
    const currentPlan = PLANS.find(plan => plan.storageLimit >= organization.storageLimit) || PLANS[0];
    
    const mockSubscription = {
      id: `sub_${organization.id}`,
      organizationId: organization.id,
      planId: currentPlan.id,
      status: 'active' as const,
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: organization.createdAt,
      updatedAt: organization.createdAt,
    };

    return NextResponse.json({
      subscription: mockSubscription,
      plan: currentPlan,
      usage: {
        organizationId: organization.id,
        period: new Date().toISOString().slice(0, 7), // YYYY-MM
        storageUsed: organization.storageUsed,
        assetsCount: 0, // Would need to count from database
        downloadCount: 0, // Would need analytics
        uploadsCount: 0, // Would need analytics
      }
    });
  } catch (error) {
    console.error("Failed to get subscription:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const body = await request.json();
    const { planId } = body;

    const plan = PLANS.find(p => p.id === planId);
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // In a real implementation, you would:
    // 1. Create a Stripe/Paddle subscription
    // 2. Update the organization's storage limit
    // 3. Store subscription details in database

    return NextResponse.json({
      message: "Subscription updated successfully",
      redirectUrl: `/dashboard/${resolvedParams.slug}/billing?success=true`
    });
  } catch (error) {
    console.error("Failed to update subscription:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}