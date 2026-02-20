import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";
import { cookies } from "next/headers";

export const GET = handleAuth({
  onSuccessRedirect: async (user: any, request: any) => {
    // Check if there's a post-login redirect URL stored in cookie
    const cookieStore = await cookies();
    const redirectUrl = cookieStore.get('post_login_redirect')?.value;

    if (redirectUrl) {
      console.log('🔗 Found post-login redirect URL in cookie:', redirectUrl);

      // Clear the cookie after using it
      cookieStore.delete('post_login_redirect');

      // Decode the URL (it was URL-encoded when stored)
      const decodedUrl = decodeURIComponent(redirectUrl);
      console.log('✅ Redirecting to:', decodedUrl);

      return decodedUrl;
    }

    // Default: redirect to the app homepage
    // The app will handle organization detection and routing
    console.log('🏠 No redirect URL found, using default: /');
    return "/";
  }
});