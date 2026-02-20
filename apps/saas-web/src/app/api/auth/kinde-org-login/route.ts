import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy login endpoint that forwards org_code and other auth params
 * to the official Kinde Next.js login handler so state is managed correctly.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const loginUrl = new URL('/api/auth/login', request.url);

  for (const [key, value] of searchParams.entries()) {
    loginUrl.searchParams.set(key, value);
  }

  return NextResponse.redirect(loginUrl.toString());
}
