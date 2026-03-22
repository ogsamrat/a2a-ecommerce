import type { Metadata } from "next";
import { JetBrains_Mono, Orbitron, Share_Tech_Mono } from "next/font/google";
import "./globals.css";
import { AlgorandWalletProvider } from "@/components/wallet-provider";

const displayFont = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800", "900"],
});

const bodyFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const labelFont = Share_Tech_Mono({
  subsets: ["latin"],
  variable: "--font-label",
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "AlgoAgent Market | Autonomous Agent Marketplace",
  description:
    "Autonomous commerce interface where buyer agents discover, compare, negotiate, and settle purchases on Algorand.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${labelFont.variable} antialiased`}
      >
        <AlgorandWalletProvider>{children}</AlgorandWalletProvider>
      </body>
    </html>
  );
}
