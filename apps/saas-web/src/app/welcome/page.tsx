"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Files } from "lucide-react";

export default function WelcomePage() {
  const [status, setStatus] = useState<"loading" | "creating" | "success" | "error">("loading");
  const [message, setMessage] = useState("Setting up your demo organization...");
  const router = useRouter();

  useEffect(() => {
    const setupDemoOrganization = async () => {
      try {
        setStatus("creating");
        setMessage("Creating your demo workspace...");

        // Create or verify demo organization
        const response = await fetch("/api/organizations/demo-org", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to setup organization");
        }

        const result = await response.json();
        
        setStatus("success");
        setMessage("Demo organization ready! Redirecting...");

        // Redirect to assets after success
        setTimeout(() => {
          router.push("/demo-org/assets");
        }, 2000);

      } catch (error) {
        console.error("Setup error:", error);
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
        
        // Redirect anyway after error (for demo purposes)
        setTimeout(() => {
          router.push("/demo-org/assets");
        }, 3000);
      }
    };

    // Small delay for better UX
    setTimeout(setupDemoOrganization, 1000);
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Files className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Stackcess!</h1>
          <p className="text-gray-600">We're setting up your digital asset management workspace.</p>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-center mb-4">
            {status === "loading" || status === "creating" ? (
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            ) : status === "success" ? (
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-5 h-5 text-white" />
              </div>
            ) : (
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white font-bold">!</span>
              </div>
            )}
          </div>
          
          <p className="text-sm text-gray-600">{message}</p>
        </div>

        <div className="space-y-3 text-left">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${
              status !== "loading" ? "bg-green-500" : "bg-gray-300"
            }`} />
            <span className="text-sm text-gray-600">Demo organization created</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${
              status === "success" ? "bg-green-500" : "bg-gray-300"
            }`} />
            <span className="text-sm text-gray-600">Assets workspace configured</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${
              status === "success" ? "bg-green-500" : "bg-gray-300"
            }`} />
            <span className="text-sm text-gray-600">Ready to upload files</span>
          </div>
        </div>

        {status === "error" && (
          <div className="mt-6">
            <button 
              onClick={() => router.push("/demo-org/assets")}
              className="w-full bg-orange-500 text-white py-3 px-4 rounded-lg hover:bg-orange-600 transition-colors font-medium"
            >
              Continue to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}