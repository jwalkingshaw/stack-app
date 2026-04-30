import { getSupabaseServer } from "@/lib/supabase";

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

function isMissingUsageSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const normalizedError = error as { code?: unknown };
  return normalizedError.code === "42P01" || normalizedError.code === "42703";
}

export async function getMonthlyAgentRunsUsage(organizationId: string): Promise<number> {
  const { periodStart } = getMonthWindow(new Date());

  const { data, error } = await getSupabaseServer()
    .from("organization_usage_monthly_snapshots")
    .select("ai_agent_runs_count")
    .eq("organization_id", organizationId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error) {
    if (!isMissingUsageSchemaError(error)) {
      console.error("Failed to read monthly agent runs usage:", error);
    }
    return 0;
  }

  const raw = (data as Record<string, unknown> | null)?.ai_agent_runs_count;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Number(raw));
}

export async function incrementAgentRunsUsage(params: {
  organizationId: string;
  occurredAt?: Date;
}): Promise<{ ok: boolean; reason?: string }> {
  const occurredAt = params.occurredAt ?? new Date();
  const usageDate = toIsoDate(occurredAt);
  const { periodStart, periodEnd } = getMonthWindow(occurredAt);

  // --- Daily row ---
  const { data: dailyExisting, error: dailySelectError } = await getSupabaseServer()
    .from("organization_usage_daily")
    .select("organization_id,usage_date,ai_agent_runs_count")
    .eq("organization_id", params.organizationId)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (dailySelectError && !isMissingUsageSchemaError(dailySelectError)) {
    console.error("Failed to read organization_usage_daily for agent metering:", dailySelectError);
    return { ok: false, reason: "daily_select_failed" };
  }
  if (dailySelectError && isMissingUsageSchemaError(dailySelectError)) {
    return { ok: false, reason: "usage_schema_missing" };
  }

  const currentDaily = Number((dailyExisting as Record<string, unknown> | null)?.ai_agent_runs_count ?? 0);

  if (dailyExisting) {
    const { error: dailyUpdateError } = await getSupabaseServer()
      .from("organization_usage_daily")
      .update({
        ai_agent_runs_count: currentDaily + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", params.organizationId)
      .eq("usage_date", usageDate);

    if (dailyUpdateError) {
      console.error("Failed to update organization_usage_daily agent runs:", dailyUpdateError);
      return { ok: false, reason: "daily_update_failed" };
    }
  } else {
    const { error: dailyInsertError } = await getSupabaseServer()
      .from("organization_usage_daily")
      .insert({
        organization_id: params.organizationId,
        usage_date: usageDate,
        source: "ai_agent",
        ai_agent_runs_count: 1,
      });

    if (dailyInsertError) {
      console.error("Failed to insert organization_usage_daily agent runs:", dailyInsertError);
      return { ok: false, reason: "daily_insert_failed" };
    }
  }

  // --- Monthly snapshot row ---
  const { data: monthlyExisting, error: monthlySelectError } = await getSupabaseServer()
    .from("organization_usage_monthly_snapshots")
    .select("organization_id,period_start,ai_agent_runs_count")
    .eq("organization_id", params.organizationId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (monthlySelectError && !isMissingUsageSchemaError(monthlySelectError)) {
    console.error(
      "Failed to read organization_usage_monthly_snapshots for agent metering:",
      monthlySelectError
    );
    return { ok: false, reason: "monthly_select_failed" };
  }
  if (monthlySelectError && isMissingUsageSchemaError(monthlySelectError)) {
    return { ok: false, reason: "usage_schema_missing" };
  }

  const currentMonthly = Number(
    (monthlyExisting as Record<string, unknown> | null)?.ai_agent_runs_count ?? 0
  );

  if (monthlyExisting) {
    const { error: monthlyUpdateError } = await getSupabaseServer()
      .from("organization_usage_monthly_snapshots")
      .update({
        ai_agent_runs_count: currentMonthly + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", params.organizationId)
      .eq("period_start", periodStart);

    if (monthlyUpdateError) {
      console.error(
        "Failed to update organization_usage_monthly_snapshots agent runs:",
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
        source: "ai_agent",
        ai_agent_runs_count: 1,
      });

    if (monthlyInsertError) {
      console.error(
        "Failed to insert organization_usage_monthly_snapshots agent runs:",
        monthlyInsertError
      );
      return { ok: false, reason: "monthly_insert_failed" };
    }
  }

  return { ok: true };
}
