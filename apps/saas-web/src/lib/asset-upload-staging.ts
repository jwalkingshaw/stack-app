"use client";

type StagedUploadEntry = {
  files: File[];
  createdAt: number;
};

const MAX_ENTRY_AGE_MS = 5 * 60 * 1000;
const MAX_STAGED_ENTRIES = 25;

const stagedUploads = new Map<string, StagedUploadEntry>();

function createToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pruneExpiredEntries(now: number) {
  for (const [token, entry] of stagedUploads.entries()) {
    if (now - entry.createdAt > MAX_ENTRY_AGE_MS) {
      stagedUploads.delete(token);
    }
  }
}

function pruneOverflowEntries() {
  if (stagedUploads.size <= MAX_STAGED_ENTRIES) return;
  const sortedByAge = Array.from(stagedUploads.entries()).sort(
    (a, b) => a[1].createdAt - b[1].createdAt
  );
  const overflowCount = stagedUploads.size - MAX_STAGED_ENTRIES;
  for (let i = 0; i < overflowCount; i += 1) {
    const [token] = sortedByAge[i];
    stagedUploads.delete(token);
  }
}

export function stageAssetUploadFiles(files: File[]): string | null {
  const validFiles = files.filter((file) => file instanceof File);
  if (validFiles.length === 0) return null;

  const now = Date.now();
  pruneExpiredEntries(now);
  pruneOverflowEntries();

  const token = createToken();
  stagedUploads.set(token, {
    files: validFiles,
    createdAt: now,
  });
  return token;
}

export function consumeStagedAssetUploadFiles(token: string): File[] {
  if (!token) return [];

  const now = Date.now();
  pruneExpiredEntries(now);

  const entry = stagedUploads.get(token);
  if (!entry) return [];
  stagedUploads.delete(token);
  return entry.files;
}

