import { NextRequest } from "next/server";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { hasOrganizationAccess } from "@/lib/user-context";
import { supabaseServer } from "@/lib/supabase";
import { assertBillingCapacity } from "@/lib/billing-policy";
import { incrementAgentRunsUsage } from "@/lib/ai-agent-metering";
import { runAgentTask, encodeSSE, type AgentStreamEvent } from "@/lib/claude-agent";

// Allow up to 60s on Vercel Pro for long agent runs
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Per-user rate limiting via Redis
// ---------------------------------------------------------------------------

const HOURLY_LIMIT = 10;
const DAILY_LIMIT = 30;

async function checkUserRateLimit(
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Lazy import — avoids crashing if Redis is not configured
    const { cache, REDIS_KEY_PREFIX_SAAS } = await import("@/lib/redis");
    const prefix = `${REDIS_KEY_PREFIX_SAAS}:ai-agent:rate:${userId}`;

    const now = new Date();
    const hh = now.getUTCHours();
    const dd = now.getUTCDate();
    const mm = now.getUTCMonth();
    const yyyy = now.getUTCFullYear();

    const hourKey = `${prefix}:h:${yyyy}-${mm}-${dd}-${hh}`;
    const dayKey  = `${prefix}:d:${yyyy}-${mm}-${dd}`;

    // Atomic INCR — increment first, then decide.
    // If over limit we still consumed a slot, but we only charged billing after
    // this check passes, so there is no double-billing risk.
    const [hourCount, dayCount] = await Promise.all([
      cache.incr(hourKey, 3600),   // TTL: 1 hour
      cache.incr(dayKey,  86400),  // TTL: 1 day
    ]);

    if (hourCount > HOURLY_LIMIT) {
      return {
        allowed: false,
        reason: `You have reached the hourly Agent limit (${HOURLY_LIMIT} tasks/hour). Please try again shortly.`,
      };
    }
    if (dayCount > DAILY_LIMIT) {
      return {
        allowed: false,
        reason: `You have reached your daily Agent limit (${DAILY_LIMIT} tasks/day).`,
      };
    }

    return { allowed: true };
  } catch {
    // Redis unavailable — allow through, billing meter is the backstop
    return { allowed: true };
  }
}

// ---------------------------------------------------------------------------
// POST /api/[tenant]/ai-agent/run
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant } = await params;

  // 1. Auth
  const { getUser } = getKindeServerSession();
  const user = await getUser();
  if (!user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const access = await hasOrganizationAccess(tenant, "collaborate");
  if (!access.hasAccess || !access.organizationId) {
    return new Response(JSON.stringify({ error: "Access denied." }), { status: 403 });
  }

  // Partners cannot use the Agent
  if (access.accessType === "partner") {
    return new Response(
      JSON.stringify({ error: "The Agent is not available for partner accounts." }),
      { status: 403 }
    );
  }

  const organizationId = access.organizationId;
  const actorUserId = user.id;

  // 2. Parse body
  let body: { prompt?: string; orgContext?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return new Response(JSON.stringify({ error: "prompt is required." }), { status: 400 });
  }

  // 3. Per-user rate limit
  const rateCheck = await checkUserRateLimit(actorUserId);
  if (!rateCheck.allowed) {
    return new Response(JSON.stringify({ error: rateCheck.reason }), { status: 429 });
  }

  // 4. Billing capacity check
  const billingCheck = await assertBillingCapacity({
    organizationId,
    meter: "agentRunsCount",
    incrementBy: 1,
  });
  if (!billingCheck.allowed) {
    return new Response(
      JSON.stringify({ error: billingCheck.message ?? "Agent task limit reached for this billing period." }),
      { status: 402 }
    );
  }

  // 5. Build org context for the system prompt
  const orgContext = {
    orgName: String(body.orgContext?.orgName ?? tenant),
    productCount: Number(body.orgContext?.productCount ?? 0) || undefined,
    familyCount: Number(body.orgContext?.familyCount ?? 0) || undefined,
    activeMarkets: Array.isArray(body.orgContext?.activeMarkets)
      ? (body.orgContext.activeMarkets as string[])
      : undefined,
    activeLocales: Array.isArray(body.orgContext?.activeLocales)
      ? (body.orgContext.activeLocales as string[])
      : undefined,
    partnerCount: Number(body.orgContext?.partnerCount ?? 0) || undefined,
    outputProfileNames: Array.isArray(body.orgContext?.outputProfileNames)
      ? (body.orgContext.outputProfileNames as string[])
      : undefined,
  };

  // 6. Stream SSE response
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSSE(event)));
        } catch {
          // Client disconnected
        }
      };

      try {
        await runAgentTask({
          prompt,
          organizationId,
          orgContext,
          actorUserId,
          supabase: supabaseServer,
          onEvent: send,
        });

        // 7. Increment billing meter on successful completion
        await incrementAgentRunsUsage({ organizationId });
      } catch (err) {
        send({ type: "error", message: "An unexpected error occurred." });
        console.error("Agent run stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
