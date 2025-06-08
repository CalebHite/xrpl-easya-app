"use client";

import { useEffect, useState } from "react";
import XRPLClient from "../scripts/xrpl-client";
import { XRPLWallet, LoanAgreement } from "../scripts/types";
import { useRouter } from "next/navigation";
import LoadingOverlay from "../components/LoadingOverlay";

export default function AccountPage() {
  const [wallets, setWallets] = useState<XRPLWallet[]>([]);
  const [activeWallet, setActiveWallet] = useState<XRPLWallet | null>(null);
  const [balance, setBalance] = useState<string>("-");
  const [loans, setLoans] = useState<LoanAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [newWalletLoading, setNewWalletLoading] = useState(false);
  const [newWalletError, setNewWalletError] = useState<string | null>(null);
  const [newWalletUserName, setNewWalletUserName] = useState("");
  const router = useRouter();

  useEffect(() => {
    const storedWallets = localStorage.getItem("xrpl_wallets");
    const activeAddress = localStorage.getItem("xrpl_wallet_active");
    if (!storedWallets || !activeAddress) {
      router.replace("/login");
      return;
    }
    const parsedWallets: XRPLWallet[] = JSON.parse(storedWallets);
    setWallets(parsedWallets);
    const found = parsedWallets.find(w => w.address === activeAddress) || null;
    setActiveWallet(found);
    if (!found) {
      setBalance("-");
      setLoans([]);
      return;
    }
    const fetchData = async () => {
      setLoading(true);
      try {
        const client = new XRPLClient();
        await client.connect();
        const bal = await client.getAccountBalance(found.address);
        setBalance(bal);
        // Fetch loans (as borrower or lender)
        const { AutoLoanWalletManager } = await import("../scripts/wallet-functions");
        const manager = new AutoLoanWalletManager(client);
        const userLoans = await manager.getLoansForAddress(found.address);
        setLoans(userLoans);
      } catch (err) {
        setBalance("-");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("xrpl_wallet_active");
    router.replace("/login");
  };

  const handleSetActive = (address: string) => {
    localStorage.setItem("xrpl_wallet_active", address);
    window.location.reload();
  };

  const handleRemoveWallet = (address: string) => {
    const filtered = wallets.filter(w => w.address !== address);
    localStorage.setItem("xrpl_wallets", JSON.stringify(filtered));
    // If removing the active wallet, set a new one or logout
    if (activeWallet && activeWallet.address === address) {
      if (filtered.length > 0) {
        localStorage.setItem("xrpl_wallet_active", filtered[0].address);
        window.location.reload();
      } else {
        localStorage.removeItem("xrpl_wallet_active");
        router.replace("/login");
      }
    } else {
      setWallets(filtered);
    }
  };

  // New wallet creation logic
  const handleCreateNewWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewWalletError(null);
    setNewWalletLoading(true);
    try {
      if (!newWalletUserName) throw new Error("Username required");
      const client = new XRPLClient();
      await client.connect();
      const wallet = await client.createAccount(newWalletUserName);
      let updatedWallets = [...wallets];
      if (!updatedWallets.some(w => w.address === wallet.address)) {
        updatedWallets.push(wallet);
      }
      localStorage.setItem("xrpl_wallets", JSON.stringify(updatedWallets));
      localStorage.setItem("xrpl_wallet_active", wallet.address);
      setWallets(updatedWallets);
      setActiveWallet(wallet);
      setNewWalletUserName("");
      window.location.reload();
    } catch (err: any) {
      setNewWalletError(err.message || "Failed to create wallet");
    } finally {
      setNewWalletLoading(false);
    }
  };

  if (!activeWallet) return null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      {loading && <LoadingOverlay message="Loading account..." />}
      <div className="bg-white p-8 rounded-lg shadow max-w-lg w-full">
        <h1 className="text-2xl font-bold mb-6 text-blue-700">Account Dashboard</h1>
        {/* New wallet creation form */}
        <form onSubmit={handleCreateNewWallet} className="mb-6 flex flex-col md:flex-row items-center gap-2">
          <input
            type="text"
            value={newWalletUserName}
            onChange={e => setNewWalletUserName(e.target.value)}
            className="p-2 border rounded bg-gray-50 flex-1"
            placeholder="New wallet username"
            required
            disabled={newWalletLoading}
          />
          <button
            type="submit"
            disabled={newWalletLoading || !newWalletUserName}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
          >
            {newWalletLoading ? "Creating..." : "Create New Wallet"}
          </button>
        </form>
        {newWalletError && <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">{newWalletError}</div>}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Your Wallets</h2>
          <ul className="mb-4">
            {wallets.map(w => (
              <li key={w.address} className="flex items-center justify-between mb-2 p-2 border rounded">
                <span className="font-mono text-gray-700 break-all">{w.userName} ({w.address.slice(0, 8)}...)</span>
                <span>
                  {activeWallet.address === w.address ? (
                    <span className="ml-2 px-2 py-1 bg-green-200 text-green-800 rounded text-xs">Active</span>
                  ) : (
                    <button onClick={() => handleSetActive(w.address)} className="ml-2 px-2 py-1 bg-blue-200 text-blue-800 rounded text-xs hover:bg-blue-300">Set Active</button>
                  )}
                  <button onClick={() => handleRemoveWallet(w.address)} className="ml-2 px-2 py-1 bg-red-200 text-red-800 rounded text-xs hover:bg-red-300">Remove</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mb-4">
          <div className="font-semibold">Username:</div>
          <div className="font-mono text-gray-700">{activeWallet.userName}</div>
        </div>
        <div className="mb-4">
          <div className="font-semibold">Wallet Address:</div>
          <div className="font-mono text-gray-700 break-all">{activeWallet.address}</div>
        </div>
        <div className="mb-4">
          <div className="font-semibold">Balance:</div>
          <div className="font-mono text-gray-700">{loading ? "..." : `${balance} XRP`}</div>
        </div>
        <button onClick={handleLogout} className="mb-6 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">Log Out</button>
      </div>
    </main>
  );
} 