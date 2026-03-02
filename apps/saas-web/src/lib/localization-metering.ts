import { supabaseServer } from "@/lib/supabase";

type LocalizationMeter = "translation" | "write";

type MeterResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
};

function isMissingUsageSchemaError(error: any): boolean {
  return error?.code === "42P01" || error?.code === "42703";
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

function resolveMeterColumn(meter: LocalizationMeter): "translation_chars" | "write_chars" {
  return meter === "translation" ? "translation_chars" : "write_chars";
}

export async function getMonthlyLocalizationUsage(params: {
  organizationId: string;
  meter: LocalizationMeter;
  onDate?: Date;
}): Promise<number> {
  const onDate = params.onDate || new Date();
  const { periodStart } = getMonthWindow(onDate);
  const meterColumn = resolveMeterColumn(params.meter);

  const { data, error } = await (supabaseServer as any)
    .from("organization_usage_monthly_snapshots")
    .select(meterColumn)
    .eq("organization_id", params.organizationId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error) {
    if (!isMissingUsageSchemaError(error)) {
      console.error("Failed to read monthly localization usage:", error);
    }
    return 0;
  }

  const raw = data?.[meterColumn];
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Number(raw));
}

export async function incrementLocalizationUsage(params: {
  organizationId: string;
  meter: LocalizationMeter;
  chars: number;
  source?: string;
  occurredAt?: Date;
}): Promise<MeterResult> {
  const chars = Number.isFinite(params.chars) ? Math.max(0, Math.floor(params.chars)) : 0;
  if (chars <= 0) {
    return { ok: true, skipped: true, reason: "zero_chars" };
  }

  const occurredAt = params.occurredAt || new Date();
  const usageDate = toIsoDate(occurredAt);
  const { periodStart, periodEnd } = getMonthWindow(occurredAt);
  const meterColumn = resolveMeterColumn(params.meter);
  const source = String(params.source || "translation_job").trim() || "translation_job";

  const { data: dailyExisting, error: dailySelectError } = await (supabaseServer as any)
    .from("organization_usage_daily")
    .select("organization_id,usage_date,translation_chars,write_chars")
    .eq("organization_id", params.organizationId)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (dailySelectError && !isMissingUsageSchemaError(dailySelectError)) {
    console.error("Failed to read organization_usage_daily for localization usage:", dailySelectError);
    return { ok: false, reason: "daily_select_failed" };
  }
  if (dailySelectError && isMissingUsageSchemaError(dailySelectError)) {
    return { ok: false, reason: "usage_schema_missing" };
  }

  if (dailyExisting) {
    const nextDailyValue = Math.max(0, Number(dailyExisting[meterColumn] || 0)) + chars;
    const { error: dailyUpdateError } = await (supabaseServer as any)
      .from("organization_usage_daily")
      .update({
        [meterColumn]: nextDailyValue,
        source,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", params.organizationId)
      .eq("usage_date", usageDate);

    if (dailyUpdateError) {
      console.error("Failed to update organization_usage_daily localization usage:", dailyUpdateError);
      return { ok: false, reason: "daily_update_failed" };
    }
  } else {
    const { error: dailyInsertError } = await (supabaseServer as any)
      .from("organization_usage_daily")
      .insert({
        organization_id: params.organizationId,
        usage_date: usageDate,
        source,
        [meterColumn]: chars,
      });

    if (dailyInsertError) {
      console.error("Failed to insert organization_usage_daily localization usage:", dailyInsertError);
      return { ok: false, reason: "daily_insert_failed" };
    }
  }

  const { data: monthlyExisting, error: monthlySelectError } = await (supabaseServer as any)
    .from("organization_usage_monthly_snapshots")
    .select("organization_id,period_start,translation_chars,write_chars")
    .eq("organization_id", params.organizationId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (monthlySelectError && !isMissingUsageSchemaError(monthlySelectError)) {
    console.error("Failed to read organization_usage_monthly_snapshots for localization usage:", monthlySelectError);
    return { ok: false, reason: "monthly_select_failed" };
  }
  if (monthlySelectError && isMissingUsageSchemaError(monthlySelectError)) {
    return { ok: false, reason: "usage_schema_missing" };
  }

  if (monthlyExisting) {
    const nextMonthlyValue = Math.max(0, Number(monthlyExisting[meterColumn] || 0)) + chars;
    const { error: monthlyUpdateError } = await (supabaseServer as any)
      .from("organization_usage_monthly_snapshots")
      .update({
        [meterColumn]: nextMonthlyValue,
        source,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", params.organizationId)
      .eq("period_start", periodStart);

    if (monthlyUpdateError) {
      console.error(
        "Failed to update organization_usage_monthly_snapshots localization usage:",
        monthlyUpdateError
      );
      return { ok: false, reason: "monthly_update_failed" };
    }
  } else {
    const { error: monthlyInsertError } = await (supabaseServer as any)
      .from("organization_usage_monthly_snapshots")
      .insert({
        organization_id: params.organizationId,
        period_start: periodStart,
        period_end: periodEnd,
        source,
        [meterColumn]: chars,
      });

    if (monthlyInsertError) {
      console.error(
        "Failed to insert organization_usage_monthly_snapshots localization usage:",
        monthlyInsertError
      );
      return { ok: false, reason: "monthly_insert_failed" };
    }
  }

  return { ok: true };
}
