import type { Metadata } from "next";
import { JetBrains_Mono, Orbitron, Share_Tech_Mono } from "next/font/google";
import { AppTopNav } from "@/src/components/app-top-nav";
import "./globals.css";

const heading = Orbitron({
  subsets: ["latin"],
  variable: "--font-heading"
});

const label = Share_Tech_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-label"
});

const body = JetBrains_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-body"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "Twitter Trend Lab",
  description: "Local browser for capture, crawl, and semantic analysis stages."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${heading.variable} ${label.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <AppTopNav />
        {children}
      </body>
    </html>
  );
}
