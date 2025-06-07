"use client";

import { useState } from "react";
import XRPLClient from "../scripts/xrpl-client";
import { XRPLWallet } from "../scripts/types";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [seed, setSeed] = useState("");
  const [userName, setUserName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Import wallet from seed
  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!seed || !userName) throw new Error("Seed and username required");
      // Validate seed by trying to create a Wallet
      const { Wallet } = await import("xrpl");
      const wallet = Wallet.fromSeed(seed);
      const xrplWallet: XRPLWallet = {
        address: wallet.address,
        seed: wallet.seed!,
        userName,
      };
      // Multi-wallet logic
      let wallets: XRPLWallet[] = [];
      const stored = localStorage.getItem("xrpl_wallets");
      if (stored) {
        wallets = JSON.parse(stored);
        // Prevent duplicates by address
        if (!wallets.some(w => w.address === xrplWallet.address)) {
          wallets.push(xrplWallet);
        }
      } else {
        wallets = [xrplWallet];
      }
      localStorage.setItem("xrpl_wallets", JSON.stringify(wallets));
      localStorage.setItem("xrpl_wallet_active", xrplWallet.address);
      router.push("/account");
    } catch (err: any) {
      setError(err.message || "Invalid seed");
    } finally {
      setLoading(false);
    }
  };

  // Create new wallet
  const handleCreate = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!userName) throw new Error("Username required");
      const client = new XRPLClient();
      await client.connect();
      const wallet = await client.createAccount(userName);
      // Multi-wallet logic
      let wallets: XRPLWallet[] = [];
      const stored = localStorage.getItem("xrpl_wallets");
      if (stored) {
        wallets = JSON.parse(stored);
        // Prevent duplicates by address
        if (!wallets.some(w => w.address === wallet.address)) {
          wallets.push(wallet);
        }
      } else {
        wallets = [wallet];
      }
      localStorage.setItem("xrpl_wallets", JSON.stringify(wallets));
      localStorage.setItem("xrpl_wallet_active", wallet.address);
      router.push("/account");
    } catch (err: any) {
      setError(err.message || "Failed to create wallet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-blue-700">Access Your XRP Wallet</h1>
        {error && <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>}
        <form onSubmit={handleImport} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Username</label>
            <input
              type="text"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              className="mt-1 p-2 w-full border rounded bg-gray-50"
              placeholder="Enter a username"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Import Wallet (Seed)</label>
            <input
              type="text"
              value={seed}
              onChange={e => setSeed(e.target.value)}
              className="mt-1 p-2 w-full border rounded bg-gray-50"
              placeholder="Enter your wallet seed to import"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          >
            {loading ? "Processing..." : "Import Wallet"}
          </button>
        </form>
        <div className="my-4 text-center text-gray-500">or</div>
        <button
          onClick={handleCreate}
          disabled={loading || !userName}
          className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
        >
          {loading ? "Processing..." : "Create New Wallet"}
        </button>
      </div>
    </main>
  );
} 