import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";

export const GET = handleAuth({
  onSuccessRedirect: async (user: any, request: any) => {
    // After successful authentication, redirect to the app
    // The app will handle organization detection and routing
    return "/";
  }
});