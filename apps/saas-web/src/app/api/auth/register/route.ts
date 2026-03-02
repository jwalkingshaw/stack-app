import { handleAuth } from '@kinde-oss/kinde-auth-nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_SECURE = process.env.NODE_ENV === 'production';
const POST_LOGIN_REDIRECT_COOKIE = 'post_login_redirect';
const PENDING_INVITE_COOKIE = 'pending_invitation_token';
const TEN_MINUTES = 10 * 60;

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

function sanitizeRedirectPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.length > 2000) return null;
  return value;
}

function isValidInvitationToken(token: string | null): token is string {
  if (!token) return false;
  return /^[0-9a-fA-F-]{36}$/.test(token);
}

export async function GET(request: NextRequest) {
  if (isPrefetchRequest(request)) {
    return new NextResponse(null, { status: 204 });
  }

  const requestUrl = new URL(request.url);
  const postLoginRedirect = sanitizeRedirectPath(
    requestUrl.searchParams.get('post_login_redirect_url')
  );
  const invitationToken = requestUrl.searchParams.get('invitation_token');

  const handler = handleAuth();
  const response = (await handler(request, {
    params: { kindeAuth: 'register' },
  })) as NextResponse;

  if (postLoginRedirect) {
    response.cookies.set(POST_LOGIN_REDIRECT_COOKIE, encodeURIComponent(postLoginRedirect), {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: TEN_MINUTES,
    });
  }

  if (isValidInvitationToken(invitationToken)) {
    response.cookies.set(PENDING_INVITE_COOKIE, invitationToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: TEN_MINUTES,
    });
  }

  return response;
}
