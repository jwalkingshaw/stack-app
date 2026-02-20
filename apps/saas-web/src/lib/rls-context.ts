import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@tradetool/database";

type ContextParams = {
  userId: string;
  organizationId?: string | null;
  organizationCode?: string | null;
};

/**
 * Applies per-request Postgres settings so RLS policies can resolve the current user/tenant.
 * Supabase executes each RPC/update in its own transaction, so we call set_config before queries.
 */
export async function applyRLSContext(
  client: SupabaseClient<Database>,
  { userId, organizationId, organizationCode }: ContextParams
) {
  const settings: Array<{ name: string; value?: string | null }> = [
    { name: "app.current_user_id", value: userId },
    { name: "app.current_tenant_id", value: organizationId ?? null },
    { name: "app.current_org_code", value: organizationCode ?? null },
  ];

  for (const setting of settings) {
    if (!setting.value) continue;
    const { error } = await (client as any).rpc("set_rls_setting", {
      setting_name: setting.name,
      new_value: setting.value,
      is_local: true,
    });

    if (error) {
      throw new Error(
        `Failed to apply RLS context for ${setting.name}: ${error.message}`
      );
    }
  }
}
