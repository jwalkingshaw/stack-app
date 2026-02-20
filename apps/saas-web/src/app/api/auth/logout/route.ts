import { handleAuth } from '@kinde-oss/kinde-auth-nextjs/server';

// Delegate directly to the Kinde logout handler even though this route
// is not the dynamic `[kindeAuth]` path.
export async function GET(request: Request) {
  const handler = handleAuth();
  return handler(request, { params: { kindeAuth: 'logout' } });
}
