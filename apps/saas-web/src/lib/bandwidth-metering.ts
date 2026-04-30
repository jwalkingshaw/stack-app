import { getSupabaseServer } from "@/lib/supabase";

type MeterResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
};

export type BandwidthMeteringMode = "off" | "estimate" | "cloudfront_logs";

function isMissingUsageSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const normalizedError = error as { code?: unknown };
  return normalizedError.code === "42P01" || normalizedError.code === "42703";
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getMonthWindow(value: Date): { periodStart: string; periodEnd: string } {
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  const end = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
  return {
    periodStart: toIsoDate(start),
    periodEnd: toIsoDate(end),
  };
}

function normalizeNumericValue(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function bytesToBillingGb(bytes: number): number {
  const normalizedBytes = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  const gb = normalizedBytes / (1024 * 1024 * 1024);
  return Math.round(gb * 1000) / 1000;
}

export function getBandwidthMeteringMode(): BandwidthMeteringMode {
  const raw = String(process.env.BANDWIDTH_METERING_MODE || "")
    .trim()
    .toLowerCase();

  if (raw === "estimate" || raw === "cloudfront_logs") {
    return raw;
  }

  return "off";
}

export function isBandwidthLimitEnforcementEnabled(): boolean {
  return String(process.env.BANDWIDTH_LIMIT_ENFORCEMENT || "")
    .trim()
    .toLowerCase() === "true";
}

export async function getMonthlyDeliveryBandwidthUsage(params: {
  organizationId: string;
  onDate?: Date;
}): Promise<number> {
  const onDate = params.onDate || new Date();
  const { periodStart } = getMonthWindow(onDate);

  const { data, error } = await getSupabaseServer()
    .from("organization_usage_monthly_snapshots")
    .select("delivery_bandwidth_gb_total")
    .eq("organization_id", params.organizationId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error) {
    if (!isMissingUsageSchemaError(error)) {
      console.error("Failed to read monthly delivery bandwidth usage:", error);
    }
    return 0;
  }

  return normalizeNumericValue(data?.delivery_bandwidth_gb_total);
}

export async function incrementDeliveryBandwidthUsage(params: {
  organizationId: string;
  bytes: number;
  source?: string;
  occurredAt?: Date;
}): Promise<MeterResult> {
  const gbAmount = bytesToBillingGb(params.bytes);
  if (gbAmount <= 0) {
    return { ok: true, skipped: true, reason: "zero_bytes" };
  }

  const occurredAt = params.occurredAt || new Date();
  const usageDate = toIsoDate(occurredAt);
  const { periodStart, periodEnd } = getMonthWindow(occurredAt);
  const source = String(params.source || "asset_delivery").trim() || "asset_delivery";

  const { data: dailyExisting, error: dailySelectError } = await getSupabaseServer()
    .from("organization_usage_daily")
    .select("organization_id,usage_date,delivery_bandwidth_gb")
    .eq("organization_id", params.organizationId)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (dailySelectError && !isMissingUsageSchemaError(dailySelectError)) {
    console.error("Failed to read organization_usage_daily for delivery bandwidth:", dailySelectError);
    return { ok: false, reason: "daily_select_failed" };
  }
  if (dailySelectError && isMissingUsageSchemaError(dailySelectError)) {
    return { ok: false, reason: "usage_schema_missing" };
  }

  if (dailyExisting) {
    const nextDailyValue = normalizeNumericValue(dailyExisting.delivery_bandwidth_gb) + gbAmount;
    const { error: dailyUpdateError } = await getSupabaseServer()
      .from("organization_usage_daily")
      .update({
        delivery_bandwidth_gb: nextDailyValue,
        source,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", params.organizationId)
      .eq("usage_date", usageDate);

    if (dailyUpdateError) {
      console.error("Failed to update organization_usage_daily delivery bandwidth:", dailyUpdateError);
      return { ok: false, reason: "daily_update_failed" };
    }
  } else {
    const { error: dailyInsertError } = await getSupabaseServer()
      .from("organization_usage_daily")
      .insert({
        organization_id: params.organizationId,
        usage_date: usageDate,
        source,
        delivery_bandwidth_gb: gbAmount,
      });

    if (dailyInsertError) {
      console.error("Failed to insert organization_usage_daily delivery bandwidth:", dailyInsertError);
      return { ok: false, reason: "daily_insert_failed" };
    }
  }

  const { data: monthlyExisting, error: monthlySelectError } = await getSupabaseServer()
    .from("organization_usage_monthly_snapshots")
    .select("organization_id,period_start,delivery_bandwidth_gb_total")
    .eq("organization_id", params.organizationId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (monthlySelectError && !isMissingUsageSchemaError(monthlySelectError)) {
    console.error("Failed to read organization_usage_monthly_snapshots for delivery bandwidth:", monthlySelectError);
    return { ok: false, reason: "monthly_select_failed" };
  }
  if (monthlySelectError && isMissingUsageSchemaError(monthlySelectError)) {
    return { ok: false, reason: "usage_schema_missing" };
  }

  if (monthlyExisting) {
    const nextMonthlyValue =
      normalizeNumericValue(monthlyExisting.delivery_bandwidth_gb_total) + gbAmount;
    const { error: monthlyUpdateError } = await getSupabaseServer()
      .from("organization_usage_monthly_snapshots")
      .update({
        delivery_bandwidth_gb_total: nextMonthlyValue,
        source,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", params.organizationId)
      .eq("period_start", periodStart);

    if (monthlyUpdateError) {
      console.error(
        "Failed to update organization_usage_monthly_snapshots delivery bandwidth:",
        monthlyUpdateError
      );
      return { ok: false, reason: "monthly_update_failed" };
    }
  } else {
    const { error: monthlyInsertError } = await getSupabaseServer()
      .from("organization_usage_monthly_snapshots")
      .insert({
        organization_id: params.organizationId,
        period_start: periodStart,
        period_end: periodEnd,
        source,
        delivery_bandwidth_gb_total: gbAmount,
      });

    if (monthlyInsertError) {
      console.error(
        "Failed to insert organization_usage_monthly_snapshots delivery bandwidth:",
        monthlyInsertError
      );
      return { ok: false, reason: "monthly_insert_failed" };
    }
  }

  return { ok: true };
}

export async function trackEstimatedDeliveryBandwidth(params: {
  organizationId: string;
  bytes: number;
  source?: string;
  occurredAt?: Date;
}): Promise<MeterResult> {
  if (getBandwidthMeteringMode() !== "estimate") {
    return { ok: true, skipped: true, reason: "metering_mode_disabled" };
  }

  return incrementDeliveryBandwidthUsage(params);
}
