"use client";

import { useEffect } from 'react';

export default function PostLoginRedirect() {
  useEffect(() => {
    // Check if there's a pending redirect from invitation flow
    const postLoginRedirect = localStorage.getItem('post_login_redirect');

    if (postLoginRedirect) {
      console.log('🔗 Found post-login redirect in localStorage:', postLoginRedirect);

      // Clear it immediately to prevent loops
      localStorage.removeItem('post_login_redirect');

      // Redirect to the stored URL
      console.log('✅ Redirecting to:', postLoginRedirect);
      window.location.href = postLoginRedirect;
    }
  }, []);

  return null; // This component doesn't render anything
}
