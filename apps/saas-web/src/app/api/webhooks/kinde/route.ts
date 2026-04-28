import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { DatabaseQueries } from "@stack-app/database";
import * as jwksClient from "jwks-rsa";
import * as jwt from "jsonwebtoken";

const KINDE_ISSUER_URL = process.env.KINDE_ISSUER_URL;
if (!KINDE_ISSUER_URL) {
  throw new Error("Missing KINDE_ISSUER_URL environment variable");
}

const client = jwksClient.default({
  jwksUri: `${KINDE_ISSUER_URL}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 86_400_000,
  cacheMaxEntries: 5,
  jwksRequestsPerMinute: 10,
});

const processedWebhooks = new Set<string>();

type KindeWebhookEvent = {
  type: string;
  event_id?: string;
  created_on?: string;
  source?: string;
  data: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function POST(request: NextRequest) {
  try {
    const token = await request.text();
    const webhookId = request.headers.get("webhook-id");

    console.log("Received Kinde webhook", {
      webhookId,
      tokenLength: token.length,
      hasToken: Boolean(token),
    });

    if (webhookId && processedWebhooks.has(webhookId)) {
      console.log("Duplicate webhook detected, skipping", webhookId);
      return NextResponse.json({ success: true, message: "Webhook already processed" });
    }

    const event = await verifyKindeWebhook(token);
    if (!event) {
      console.error("Webhook verification failed");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    if (webhookId) {
      processedWebhooks.add(webhookId);
      if (processedWebhooks.size > 1000) {
        const webhookArray = Array.from(processedWebhooks);
        processedWebhooks.clear();
        webhookArray.slice(-500).forEach((id) => processedWebhooks.add(id));
      }
    }

    const db = new DatabaseQueries(supabaseServer);
    const { type, data } = event;

    switch (type) {
      case "organization.created":
        await handleOrganizationCreated(db, data);
        break;
      case "organization.updated":
        await handleOrganizationUpdated(db, data);
        break;
      case "organization.deleted":
        await handleOrganizationDeleted(db, data);
        break;
      case "user.created":
        console.log("User created event", asString(asRecord(data.user).id));
        break;
      case "user.updated":
        console.log("User updated event", asString(asRecord(data.user).id));
        break;
      default:
        console.log(`Unhandled webhook type: ${type}`);
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${type} event successfully`,
    });
  } catch (error) {
    console.error("Webhook processing error", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function verifyKindeWebhook(token: string): Promise<KindeWebhookEvent | null> {
  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    const header = asRecord(asRecord(decodedHeader).header);
    const keyId = asString(header.kid);
    if (!keyId) {
      console.error("Invalid JWT header or missing key ID");
      return null;
    }

    const key = await client.getSigningKey(keyId);
    const publicKey = key.getPublicKey();

    const verifiedPayload = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: KINDE_ISSUER_URL,
    });

    const payload = asRecord(verifiedPayload);
    const type = asString(payload.type);
    if (!type) {
      console.error("Webhook payload missing event type");
      return null;
    }

    const event: KindeWebhookEvent = {
      type,
      data: asRecord(payload.data),
    };

    const eventId = asString(payload.event_id);
    const createdOn = asString(payload.created_on);
    const source = asString(payload.source);
    if (eventId) event.event_id = eventId;
    if (createdOn) event.created_on = createdOn;
    if (source) event.source = source;

    if (event.created_on) {
      const eventTime = new Date(event.created_on).getTime();
      const currentTime = Date.now();
      const tenMinutes = 10 * 60 * 1000;
      if (currentTime - eventTime > tenMinutes) {
        console.warn("Webhook event is older than 10 minutes");
      }
    }

    return event;
  } catch (error) {
    console.error("Kinde webhook verification failed", {
      error: error instanceof Error ? error.message : error,
      tokenPreview: `${token.substring(0, 50)}...`,
    });
    return null;
  }
}

async function handleOrganizationCreated(db: DatabaseQueries, orgData: Record<string, unknown>) {
  try {
    const id = asString(orgData.id);
    if (!id) {
      console.error("organization.created webhook missing id");
      return;
    }

    const name = asString(orgData.name) || "Unnamed Organization";
    const code = asString(orgData.code) || `org-${Date.now()}`;

    await db.createOrganization({
      name,
      slug: code,
      kindeOrgId: id,
      storageUsed: 0,
      storageLimit: 5_368_709_120,
      type: "brand",
      organizationType: "brand",
      partnerCategory: null,
    });

    console.log(`Organization created: ${name} (${code})`);
  } catch (error) {
    console.error("Failed to create organization", error);
  }
}

async function handleOrganizationUpdated(_db: DatabaseQueries, orgData: Record<string, unknown>) {
  try {
    const id = asString(orgData.id);
    if (!id) {
      console.error("organization.updated webhook missing id");
      return;
    }

    const name = asString(orgData.name);
    const code = asString(orgData.code);
    const updatePayload: { name?: string; slug?: string } = {};
    if (name) updatePayload.name = name;
    if (code) updatePayload.slug = code;
    if (Object.keys(updatePayload).length === 0) {
      console.warn("organization.updated webhook has no name/code fields to update");
      return;
    }

    const { error } = await supabaseServer
      .from("organizations")
      .update(updatePayload)
      .eq("kinde_org_id", id);

    if (error) {
      console.error("Failed to update organization", error);
      return;
    }

    console.log(`Organization updated: ${name || "unknown"} (${code || "unknown"})`);
  } catch (error) {
    console.error("Failed to update organization", error);
  }
}

async function handleOrganizationDeleted(_db: DatabaseQueries, orgData: Record<string, unknown>) {
  try {
    const id = asString(orgData.id);
    if (!id) {
      console.error("organization.deleted webhook missing id");
      return;
    }

    const { error } = await supabaseServer
      .from("organizations")
      .delete()
      .eq("kinde_org_id", id);

    if (error) {
      console.error("Failed to delete organization", error);
      return;
    }

    console.log(`Organization deleted: ${id}`);
  } catch (error) {
    console.error("Failed to delete organization", error);
  }
}
