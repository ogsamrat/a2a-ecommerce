"use client";

import { useWallet } from "@txnlab/use-wallet-react";
import type { Wallet } from "@txnlab/use-wallet-react";
import { useState, useEffect } from "react";

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function isUserClosedWalletModal(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("modal is closed by user") ||
    msg.includes("cancel") ||
    msg.includes("user rejected")
  );
}

export function WalletConnect() {
  const { wallets, activeAccount, activeWallet, isReady } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [connectError, setConnectError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activeAccount?.address) {
      setBalance(null);
      return;
    }
    fetch(`/api/wallet/info?address=${activeAccount.address}`)
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? null))
      .catch(() => setBalance(null));
  }, [activeAccount?.address]);

  if (!mounted || !isReady) {
    return (
      <div className="wallet-trigger" aria-live="polite">
        Loading...
      </div>
    );
  }

  if (activeWallet && activeAccount) {
    return (
      <div className="wallet-shell">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="wallet-trigger wallet-trigger--connected"
        >
          <span className="wallet-dot" />
          <span>{truncateAddr(activeAccount.address)}</span>
          {balance !== null && (
            <span className="wallet-balance">{balance.toFixed(2)} ALGO</span>
          )}
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div className="wallet-menu">
              <div className="wallet-menu-head">
                <p className="wallet-menu-subtitle">
                  Connected via {activeWallet.metadata.name}
                </p>
                <p className="wallet-menu-address">{activeAccount.address}</p>
                {balance !== null && (
                  <p className="wallet-menu-title">{balance.toFixed(4)} ALGO</p>
                )}
              </div>
              <div className="wallet-menu-body">
                <button
                  onClick={() => {
                    activeWallet.disconnect();
                    setIsOpen(false);
                  }}
                  className="wallet-disconnect"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-shell">
      <button onClick={() => setIsOpen(!isOpen)} className="wallet-trigger">
        Connect Wallet
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="wallet-menu">
            <div className="wallet-menu-head">
              <p className="wallet-menu-title">Connect a Wallet</p>
              <p className="wallet-menu-subtitle">
                Choose your preferred wallet
              </p>
              {connectError && (
                <p className="status-bad" role="alert">
                  {connectError}
                </p>
              )}
            </div>
            <div className="wallet-menu-body">
              {wallets.map((w: Wallet) => (
                <button
                  key={w.id}
                  onClick={async () => {
                    setConnectError("");
                    try {
                      await w.connect();
                      setIsOpen(false);
                    } catch (error) {
                      if (!isUserClosedWalletModal(error)) {
                        setConnectError(
                          "Wallet connection failed. Please try again.",
                        );
                      }
                    }
                  }}
                  className="wallet-option"
                >
                  <div className="wallet-option-icon">
                    {w.metadata.icon && (
                      <img
                        src={w.metadata.icon}
                        alt={w.metadata.name}
                        className="w-6 h-6"
                      />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="wallet-menu-title">{w.metadata.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
