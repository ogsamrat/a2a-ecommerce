import type { Metadata } from "next";
import "./globals.css";
import { AlgorandWalletProvider } from "@/components/wallet-provider";

export const metadata: Metadata = {
  title: "A2A // Agentic Commerce",
  description: "Autonomous AI agents discover, negotiate, and transact on Algorand. On-chain ZK · x402 protocol · Real ALGO.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen scanlines">
        <AlgorandWalletProvider>{children}</AlgorandWalletProvider>
      </body>
    </html>
  );
}
