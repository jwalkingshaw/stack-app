import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";
import { cookies } from "next/headers";

const POST_LOGIN_REDIRECT_COOKIE = "post_login_redirect";
const PENDING_INVITE_COOKIE = "pending_invitation_token";

function isValidInvitationToken(token: string | undefined): token is string {
  if (!token) return false;
  return /^[0-9a-fA-F-]{36}$/.test(token);
}

export const GET = handleAuth({
  onSuccessRedirect: async () => {
    const cookieStore = await cookies();
    const redirectUrl = cookieStore.get(POST_LOGIN_REDIRECT_COOKIE)?.value;
    const pendingInviteToken = cookieStore.get(PENDING_INVITE_COOKIE)?.value;

    if (redirectUrl) {
      cookieStore.delete(POST_LOGIN_REDIRECT_COOKIE);
      const decodedUrl = decodeURIComponent(redirectUrl);
      console.log("[auth] Redirecting to post-login target:", decodedUrl);
      return decodedUrl;
    }

    if (isValidInvitationToken(pendingInviteToken)) {
      cookieStore.delete(PENDING_INVITE_COOKIE);
      const fallback = `/invitations/accept?token=${pendingInviteToken}`;
      console.log("[auth] Falling back to pending invitation redirect:", fallback);
      return fallback;
    }

    console.log("[auth] No post-login redirect found, using /");
    return "/";
  },
});
