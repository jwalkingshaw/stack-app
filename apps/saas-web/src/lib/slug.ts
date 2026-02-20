import { randomUUID } from "crypto";

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function ensureSlug(value: string) {
  const base = slugify(value);
  return base.length > 0 ? base : randomUUID();
}
