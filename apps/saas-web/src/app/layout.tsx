import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import ClientProviders from "@/components/ClientProviders";
import PostLoginRedirect from "./PostLoginRedirect";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "STACKCESS - Digital Assets Platform",
  description: "Unified workspace for supplement brands and retailers. Manage your assets and stay updated with industry news.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ClientProviders>
            <PostLoginRedirect />
            <main className="min-h-screen">
              {children}
            </main>
          </ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
