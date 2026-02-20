#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local", override: false });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let ORGANIZATION_ID = process.env.PERF_ORG_ID;
const ORGANIZATION_SLUG = process.env.PERF_ORG_SLUG || null;
const PERMISSION_KEY = process.env.PERF_PERMISSION_KEY || "product.market.scope.read";
const MARKET_ID = process.env.PERF_MARKET_ID || null;
const CHANNEL_ID = process.env.PERF_CHANNEL_ID || null;
const COLLECTION_ID = process.env.PERF_COLLECTION_ID || null;
const ITERATIONS = Number(process.env.PERF_ITERATIONS || 5000);
const CONCURRENCY = Number(process.env.PERF_CONCURRENCY || 50);
const SAMPLE_USERS = Number(process.env.PERF_SAMPLE_USERS || 300);

const missingVars = [];
if (!SUPABASE_URL) missingVars.push("NEXT_PUBLIC_SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) missingVars.push("SUPABASE_SERVICE_ROLE_KEY");
if (!ORGANIZATION_ID && !ORGANIZATION_SLUG) missingVars.push("PERF_ORG_ID (or PERF_ORG_SLUG)");

if (missingVars.length > 0) {
  console.error(`Missing required env vars: ${missingVars.join(", ")}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};

const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

async function loadMemberUserIds() {
  const { data, error } = await supabase
    .from("organization_members")
    .select("kinde_user_id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("status", "active")
    .limit(SAMPLE_USERS);

  if (error) {
    throw new Error(`Failed to load organization members: ${error.message}`);
  }

  const users = (data || [])
    .map((row) => row.kinde_user_id)
    .filter((id) => typeof id === "string" && id.length > 0);

  if (!users.length) {
    throw new Error("No active organization members found for PERF_ORG_ID");
  }

  return users;
}

async function resolveOrganizationIdFromSlug(slug) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error(`Failed to resolve PERF_ORG_SLUG="${slug}" to organization id`);
  }
  return data.id;
}

async function run() {
  if (!ORGANIZATION_ID && ORGANIZATION_SLUG) {
    ORGANIZATION_ID = await resolveOrganizationIdFromSlug(ORGANIZATION_SLUG);
    console.log(`Resolved PERF_ORG_SLUG=${ORGANIZATION_SLUG} -> PERF_ORG_ID=${ORGANIZATION_ID}`);
  }

  const users = await loadMemberUserIds();
  console.log(
    `Running authz load test: users=${users.length}, iterations=${ITERATIONS}, concurrency=${CONCURRENCY}, permission=${PERMISSION_KEY}`
  );

  const durations = [];
  let denied = 0;
  let allowed = 0;
  let errors = 0;

  let i = 0;
  const start = Date.now();

  const worker = async () => {
    while (true) {
      const idx = i++;
      if (idx >= ITERATIONS) return;

      const userId = users[idx % users.length];
      const t0 = Date.now();
      const { data, error } = await supabase.rpc("authz_has_permission", {
        user_id_param: userId,
        organization_id_param: ORGANIZATION_ID,
        permission_key_param: PERMISSION_KEY,
        market_id_param: MARKET_ID,
        channel_id_param: CHANNEL_ID,
        collection_id_param: COLLECTION_ID,
      });
      const elapsed = Date.now() - t0;
      durations.push(elapsed);

      if (error) {
        errors += 1;
        continue;
      }
      if (data === true) allowed += 1;
      else denied += 1;
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const totalMs = Date.now() - start;
  const throughput = totalMs > 0 ? (durations.length / totalMs) * 1000 : 0;
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const p99 = percentile(durations, 99);
  const mean = avg(durations);

  console.log("---- Authz Load Test Results ----");
  console.log(`Total checks: ${durations.length}`);
  console.log(`Allowed: ${allowed}`);
  console.log(`Denied: ${denied}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total time: ${totalMs} ms`);
  console.log(`Throughput: ${throughput.toFixed(2)} checks/sec`);
  console.log(`Latency avg: ${mean.toFixed(2)} ms`);
  console.log(`Latency p50: ${p50.toFixed(2)} ms`);
  console.log(`Latency p95: ${p95.toFixed(2)} ms`);
  console.log(`Latency p99: ${p99.toFixed(2)} ms`);

  const targetP95 = Number(process.env.PERF_TARGET_P95_MS || 120);
  if (p95 > targetP95) {
    console.error(`FAIL: p95 ${p95.toFixed(2)} ms > target ${targetP95} ms`);
    process.exitCode = 2;
    return;
  }

  console.log(`PASS: p95 ${p95.toFixed(2)} ms <= target ${targetP95} ms`);
}

run().catch((error) => {
  console.error("Authz load test failed:", error);
  process.exit(1);
});
