import { EnvBanner } from "@/components/env-banner";
import { SwRegister } from "@/components/sw-register";
import { AuthProvider } from "@/contexts/auth-context";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Todo PWA",
  description: "Eisenhower tasks and recurring workflow check-ins.",
  appleWebApp: {
    capable: true,
    title: "Todo",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-50 font-sans text-zinc-950 antialiased dark:bg-zinc-950 dark:text-zinc-50">
        <EnvBanner />
        <AuthProvider>
          <SwRegister />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
