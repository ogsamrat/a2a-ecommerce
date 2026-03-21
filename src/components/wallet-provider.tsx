"use client";

import { WalletProvider } from "@txnlab/use-wallet-react";
import { WalletManager, WalletId, NetworkId } from "@txnlab/use-wallet-react";
import { useMemo } from "react";

export function AlgorandWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const walletManager = useMemo(() => {
    return new WalletManager({
      wallets: [
        WalletId.PERA,
        WalletId.DEFLY,
        {
          id: WalletId.LUTE,
          options: { siteName: "AgentDEX" },
        },
      ],
      defaultNetwork: NetworkId.TESTNET,
    });
  }, []);

  return <WalletProvider manager={walletManager}>{children}</WalletProvider>;
}
