export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  details?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function readApiData<T>(payload: unknown, fallback: T): T {
  if (!isRecord(payload)) {
    return (payload as T | undefined) ?? fallback;
  }

  if ('data' in payload) {
    return (payload.data as T | undefined) ?? fallback;
  }

  return (payload as T | undefined) ?? fallback;
}

export function readApiError(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    return payload.error;
  }
  return fallback;
}
