import { handleAuth } from '@kinde-oss/kinde-auth-nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

function isPrefetchRequest(request: NextRequest) {
  const purpose = request.headers.get('purpose') || request.headers.get('sec-purpose');
  const prefetchHeader =
    request.headers.get('x-middleware-prefetch') ||
    request.headers.get('next-router-prefetch');
  const fetchMode = request.headers.get('sec-fetch-mode');
  const fetchDest = request.headers.get('sec-fetch-dest');

  if (prefetchHeader) return true;
  if (purpose && purpose.toLowerCase().includes('prefetch')) return true;
  if (fetchMode && fetchMode !== 'navigate') return true;
  if (fetchDest && fetchDest !== 'document') return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (isPrefetchRequest(request)) {
    return new NextResponse(null, { status: 204 });
  }

  const handler = handleAuth();
  return handler(request, { params: { kindeAuth: 'login' } });
}
