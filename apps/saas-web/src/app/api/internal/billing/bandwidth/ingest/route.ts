import { NextRequest, NextResponse } from "next/server";
import { incrementDeliveryBandwidthUsage } from "@/lib/bandwidth-metering";

type IngestEvent = {
  organizationId?: string;
  bytes?: number;
  source?: string;
  occurredAt?: string;
};

function isAuthorized(request: NextRequest): boolean {
  const expected = String(process.env.BANDWIDTH_INGEST_SECRET || "").trim();
  if (!expected) return false;
  const provided = String(request.headers.get("x-bandwidth-ingest-secret") || "").trim();
  return Boolean(provided) && provided === expected;
}

function normalizeEvent(raw: unknown): IngestEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const organizationId =
    typeof value.organizationId === "string"
      ? value.organizationId.trim()
      : typeof value.organization_id === "string"
        ? value.organization_id.trim()
        : "";
  const bytes = Number(value.bytes);
  const source =
    typeof value.source === "string" && value.source.trim().length > 0
      ? value.source.trim()
      : "cloudfront_log";
  const occurredAt =
    typeof value.occurredAt === "string"
      ? value.occurredAt
      : typeof value.occurred_at === "string"
        ? value.occurred_at
        : undefined;

  if (!organizationId || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  return {
    organizationId,
    bytes,
    source,
    occurredAt,
  };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const rawEvents: unknown[] = Array.isArray(body?.events) ? body.events : [];
  if (rawEvents.length === 0) {
    return NextResponse.json({ error: "events must be a non-empty array" }, { status: 400 });
  }

  const events = rawEvents
    .map(normalizeEvent)
    .filter(
      (
        event: IngestEvent | null
      ): event is Required<Pick<IngestEvent, "organizationId" | "bytes" | "source">> & {
        occurredAt?: string;
      } => Boolean(event)
    );

  if (events.length === 0) {
    return NextResponse.json({ error: "No valid events supplied" }, { status: 400 });
  }

  const results = [];
  for (const event of events) {
    const occurredAt =
      typeof event.occurredAt === "string" && event.occurredAt.trim().length > 0
        ? new Date(event.occurredAt)
        : undefined;

    const result = await incrementDeliveryBandwidthUsage({
      organizationId: event.organizationId,
      bytes: event.bytes,
      source: event.source,
      occurredAt:
        occurredAt && Number.isFinite(occurredAt.getTime()) ? occurredAt : undefined,
    });

    results.push({
      organizationId: event.organizationId,
      bytes: event.bytes,
      source: event.source,
      ok: result.ok,
      skipped: result.skipped || false,
      reason: result.reason || null,
    });
  }

  return NextResponse.json({
    success: true,
    ingested: results.filter((row) => row.ok && !row.skipped).length,
    results,
  });
}
