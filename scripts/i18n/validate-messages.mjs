import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const messagesDir = path.join(projectRoot, "apps", "saas-web", "messages");
const baseLocale = "en-US";
const targetLocales = ["es-MX"];

function flattenKeys(value, prefix = "", output = new Set()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) output.add(prefix);
    return output;
  }

  const entries = Object.entries(value);
  if (entries.length === 0 && prefix) {
    output.add(prefix);
    return output;
  }

  for (const [key, child] of entries) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    flattenKeys(child, nextKey, output);
  }
  return output;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fail(message) {
  console.error(`\n[i18n-check] ${message}`);
  process.exit(1);
}

const baseFilePath = path.join(messagesDir, `${baseLocale}.json`);
if (!fs.existsSync(baseFilePath)) {
  fail(`Missing base locale file: ${baseFilePath}`);
}

const baseKeys = flattenKeys(loadJson(baseFilePath));
if (baseKeys.size === 0) {
  fail(`Base locale ${baseLocale} has no keys.`);
}

for (const locale of targetLocales) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  if (!fs.existsSync(filePath)) {
    fail(`Missing locale file: ${filePath}`);
  }

  const localeKeys = flattenKeys(loadJson(filePath));
  const missing = [...baseKeys].filter((key) => !localeKeys.has(key));
  const extras = [...localeKeys].filter((key) => !baseKeys.has(key));

  if (missing.length || extras.length) {
    console.error(`\n[i18n-check] Locale ${locale} is out of sync with ${baseLocale}.`);
    if (missing.length) {
      console.error(`[i18n-check] Missing keys (${missing.length}):`);
      for (const key of missing) console.error(`  - ${key}`);
    }
    if (extras.length) {
      console.error(`[i18n-check] Extra keys (${extras.length}):`);
      for (const key of extras) console.error(`  - ${key}`);
    }
    process.exit(1);
  }
}

console.log("[i18n-check] Locale catalogs are in sync.");
