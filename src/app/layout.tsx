import type { Metadata } from "next";

import { JetBrains_Mono } from "next/font/google";
import { QueryProvider } from "@/components/QueryProvider";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RedM Insights - Server & Resource Analytics",
  description: "Browse RedM servers and resources with real-time analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.variable} antialiased`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
