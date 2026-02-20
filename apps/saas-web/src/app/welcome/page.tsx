import { Suspense } from "react";
import WelcomeClient from "./WelcomeClient";

export default function WelcomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
          <div className="text-sm text-slate-300">Loading...</div>
        </div>
      }
    >
      <WelcomeClient />
    </Suspense>
  );
}
