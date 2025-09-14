import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientProviders from "@/components/ClientProviders";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "STACKCESS - Digital Assets Platform",
  description: "Unified workspace for supplement brands and retailers. Manage your assets and stay updated with industry news.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClientProviders>
          <main className="min-h-screen">
            {children}
          </main>
        </ClientProviders>
      </body>
    </html>
  );
}