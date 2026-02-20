import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { DatabaseQueries } from "@tradetool/database";
import * as jwksClient from "jwks-rsa";
import * as jwt from "jsonwebtoken";

// Kinde webhook configuration using recommended approach
const KINDE_ISSUER_URL = process.env.KINDE_ISSUER_URL;
if (!KINDE_ISSUER_URL) {
  throw new Error('Missing KINDE_ISSUER_URL environment variable');
}

// Create JWKS client using Kinde's recommended approach
const client = jwksClient.default({
  jwksUri: `${KINDE_ISSUER_URL}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  cacheMaxEntries: 5,
  jwksRequestsPerMinute: 10,
});

// Store processed webhook IDs to prevent duplicate processing
const processedWebhooks = new Set<string>();

// Webhook handler for Kinde events
export async function POST(request: NextRequest) {
  try {
    // Get the raw JWT token from request body (Kinde sends webhook as JWT)
    const token = await request.text();
    
    // Get webhook headers for additional security
    const webhookId = request.headers.get("webhook-id");
    
    console.log('📥 Received Kinde webhook:', {
      webhookId,
      tokenLength: token.length,
      hasToken: !!token,
    });
    
    // Check for duplicate webhook processing
    if (webhookId && processedWebhooks.has(webhookId)) {
      console.log('⚠️ Duplicate webhook detected, skipping processing:', webhookId);
      return NextResponse.json({ 
        success: true, 
        message: "Webhook already processed" 
      });
    }
    
    // Verify webhook JWT using Kinde's recommended approach
    const event = await verifyKindeWebhook(token);
    
    if (!event) {
      console.error('🚨 Webhook verification failed');
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
    
    console.log('✅ Webhook verified successfully:', {
      type: event.type,
      eventId: event.event_id,
      webhookId,
    });
    
    // Mark webhook as processed
    if (webhookId) {
      processedWebhooks.add(webhookId);
      // Clean up old webhook IDs (keep only last 1000)
      if (processedWebhooks.size > 1000) {
        const webhookArray = Array.from(processedWebhooks);
        processedWebhooks.clear();
        webhookArray.slice(-500).forEach(id => processedWebhooks.add(id));
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
        console.log('📝 User created event received:', data?.user?.id);
        // Handle user creation if needed
        break;
      
      case "user.updated":
        console.log('📝 User updated event received:', data?.user?.id);
        // Handle user updates if needed
        break;
      
      default:
        console.log(`🔍 Unhandled webhook type: ${type}`);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Processed ${type} event successfully` 
    });
  } catch (error) {
    console.error('🚨 Webhook processing error:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * Verify Kinde webhook JWT using their recommended approach
 * @param token - Raw JWT token from webhook body
 * @returns Promise<any | null> - Verified event payload or null if invalid
 */
async function verifyKindeWebhook(token: string): Promise<any | null> {
  try {
    // Decode token header to get key ID
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.header.kid) {
      console.error('🚨 Invalid JWT header or missing key ID');
      return null;
    }
    
    console.log('🔍 JWT Header:', {
      alg: decodedHeader.header.alg,
      kid: decodedHeader.header.kid,
      typ: decodedHeader.header.typ,
    });
    
    // Get the signing key from Kinde's JWKS
    const key = await client.getSigningKey(decodedHeader.header.kid);
    const publicKey = key.getPublicKey();
    
    // Verify the JWT token using Kinde's public key
    const event = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: KINDE_ISSUER_URL,
    }) as any;
    
    console.log('🔐 Webhook JWT verification successful:', {
      type: event.type,
      event_id: event.event_id,
      created_on: event.created_on,
      source: event.source,
    });
    
    // Additional validation: check if event is recent (within 10 minutes)
    if (event.created_on) {
      const eventTime = new Date(event.created_on).getTime();
      const currentTime = Date.now();
      const tenMinutes = 10 * 60 * 1000;
      
      if (currentTime - eventTime > tenMinutes) {
        console.warn('⚠️ Webhook event is older than 10 minutes - possible replay');
        // Don't reject, but log for monitoring
      }
    }
    
    return event;
  } catch (error) {
    console.error('🚨 Kinde webhook verification failed:', {
      error: error instanceof Error ? error.message : error,
      tokenPreview: token.substring(0, 50) + '...',
    });
    
    // Log specific JWT errors for debugging
    if (error instanceof Error) {
      if (error.message.includes('signature')) {
        console.error('🚨 JWT signature verification failed');
      } else if (error.message.includes('expired')) {
        console.error('🚨 JWT token has expired');
      } else if (error.message.includes('issuer')) {
        console.error('🚨 JWT issuer validation failed');
      }
    }
    
    return null;
  }
}

async function handleOrganizationCreated(db: DatabaseQueries, orgData: any) {
  try {
    console.log('🏢 Creating organization:', {
      name: orgData.name,
      code: orgData.code,
      id: orgData.id,
    });

    await db.createOrganization({
      name: orgData.name || "Unnamed Organization",
      slug: orgData.code || `org-${Date.now()}`,
      kindeOrgId: orgData.id,
      storageUsed: 0,
      storageLimit: 5368709120, // 5GB default
      type: "brand",
      organizationType: "brand",
      partnerCategory: null,
    } as any);
    
    console.log(`✅ Organization created: ${orgData.name} (${orgData.code})`);
  } catch (error) {
    console.error("❌ Failed to create organization:", error);
  }
}

async function handleOrganizationUpdated(db: DatabaseQueries, orgData: any) {
  try {
    console.log('🏢 Updating organization:', {
      name: orgData.name,
      code: orgData.code,
      id: orgData.id,
    });

    const { error } = await (supabaseServer as any)
      .from("organizations")
      .update({
        name: orgData.name,
        slug: orgData.code,
      })
      .eq("kinde_org_id", orgData.id);

    if (error) {
      console.error("❌ Failed to update organization:", error);
    } else {
      console.log(`✅ Organization updated: ${orgData.name} (${orgData.code})`);
    }
  } catch (error) {
    console.error("❌ Failed to update organization:", error);
  }
}

async function handleOrganizationDeleted(db: DatabaseQueries, orgData: any) {
  try {
    console.log('🏢 Deleting organization:', {
      id: orgData.id,
    });

    const { error } = await supabaseServer
      .from("organizations")
      .delete()
      .eq("kinde_org_id", orgData.id);

    if (error) {
      console.error("❌ Failed to delete organization:", error);
    } else {
      console.log(`✅ Organization deleted: ${orgData.id}`);
    }
  } catch (error) {
    console.error("❌ Failed to delete organization:", error);
  }
}
