import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const outputPath = path.join(repoRoot, "packages", "database", "src", "types.ts");

loadEnvFiles(repoRoot);

const projectId =
  process.env.SUPABASE_PROJECT_ID ||
  deriveProjectIdFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

if (!projectId) {
  console.error(
    "Unable to determine Supabase project ID. Set SUPABASE_PROJECT_ID or NEXT_PUBLIC_SUPABASE_URL."
  );
  process.exit(1);
}

const schema = process.env.SUPABASE_DB_SCHEMA || "public";
const npxBin = "npx";
const args = [
  "--yes",
  "supabase",
  "gen",
  "types",
  "typescript",
  "--project-id",
  projectId,
  "--schema",
  schema,
];

const result = spawnSync(npxBin, args, {
  cwd: repoRoot,
  env: process.env,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.status !== 0 || !result.stdout) {
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    console.error(result.error.message);
  }
  process.exit(result.status || 1);
}

fs.writeFileSync(outputPath, result.stdout.trimEnd() + "\n", "utf8");
console.log(`Generated Supabase types for project ${projectId} into ${path.relative(repoRoot, outputPath)}`);

function loadEnvFiles(rootDir) {
  const envFiles = [
    path.join(rootDir, ".env"),
    path.join(rootDir, ".env.local"),
    path.join(rootDir, "apps", "saas-web", ".env"),
    path.join(rootDir, "apps", "saas-web", ".env.local"),
  ];

  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile, override: false });
    }
  }
}

function deriveProjectIdFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  return match ? match[1] : null;
}
