import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import ClientProviders from "@/components/ClientProviders";
import PostLoginRedirect from "./PostLoginRedirect";

const inter = Inter({ subsets: ["latin"] });

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "STACKCESS - Digital Assets Platform",
  description: "Unified workspace for supplement brands and retailers. Manage your assets and stay updated with industry news.",
  icons: {
    icon: [{ url: '/stackcess-favicon.svg', type: 'image/svg+xml' }, { url: '/stackcess-icon-wb-logo.png', type: 'image/png' }],
    shortcut: '/stackcess-icon-wb-logo.png',
    apple: '/stackcess-icon-wb-logo.png',
  },
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
      <body className={`${inter.className} ${jetbrainsMono.variable}`}>
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
