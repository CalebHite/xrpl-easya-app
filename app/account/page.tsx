"use client";

import { useEffect, useState } from "react";
import XRPLClient from "../scripts/xrpl-client";
import { XRPLWallet, LoanAgreement } from "../scripts/types";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const [wallet, setWallet] = useState<XRPLWallet | null>(null);
  const [balance, setBalance] = useState<string>("-");
  const [loans, setLoans] = useState<LoanAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("xrpl_wallet");
    if (!stored) {
      router.replace("/login");
      return;
    }
    const parsed: XRPLWallet = JSON.parse(stored);
    setWallet(parsed);
    const fetchData = async () => {
      setLoading(true);
      try {
        const client = new XRPLClient();
        await client.connect();
        const bal = await client.getAccountBalance(parsed.address);
        setBalance(bal);
        // Fetch loans (as borrower or lender)
        const { AutoLoanWalletManager } = await import("../scripts/wallet-functions");
        const manager = new AutoLoanWalletManager(client);
        const userLoans = await manager.getLoansForAddress(parsed.address);
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
    localStorage.removeItem("xrpl_wallet");
    router.replace("/login");
  };

  if (!wallet) return null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow max-w-lg w-full">
        <h1 className="text-2xl font-bold mb-6 text-blue-700">Account Dashboard</h1>
        <div className="mb-4">
          <div className="font-semibold">Username:</div>
          <div className="font-mono text-gray-700">{wallet.userName}</div>
        </div>
        <div className="mb-4">
          <div className="font-semibold">Wallet Address:</div>
          <div className="font-mono text-gray-700 break-all">{wallet.address}</div>
        </div>
        <div className="mb-4">
          <div className="font-semibold">Balance:</div>
          <div className="font-mono text-gray-700">{loading ? "..." : `${balance} XRP`}</div>
        </div>
        <button onClick={handleLogout} className="mb-6 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">Log Out</button>
        <h2 className="text-xl font-semibold mb-2 mt-4">Your Loans</h2>
        {loading ? (
          <div>Loading loans...</div>
        ) : loans.length === 0 ? (
          <div className="text-gray-500">No loans found.</div>
        ) : (
          <div className="space-y-3">
            {loans.map((loan) => (
              <div key={loan.id} className="p-3 border rounded">
                <div><strong>Loan ID:</strong> {loan.id}</div>
                <div><strong>Principal:</strong> {loan.principalAmount} XRP</div>
                <div><strong>Interest Rate:</strong> {loan.interestRate}%</div>
                <div><strong>Total Repayment:</strong> {loan.totalRepaymentAmount} XRP</div>
                <div><strong>Status:</strong> {loan.status}</div>
                <div><strong>Role:</strong> {loan.borrowerAddress === wallet.address ? "Borrower" : "Lender"}</div>
                <div><strong>Repayment Due:</strong> {new Date(loan.executeAt * 1000).toLocaleString()}</div>
                {loan.terms && <div><strong>Terms:</strong> {loan.terms}</div>}
                {loan.status === 'repaid' && loan.repaidAt && (
                  <div><strong>Repaid At:</strong> {new Date(loan.repaidAt * 1000).toLocaleString()}</div>
                )}
                {loan.status === 'defaulted' && (
                  <div className="text-red-600"><strong>Status:</strong> Defaulted</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
} 