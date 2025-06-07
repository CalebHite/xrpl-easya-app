'use client';

import { useState, useEffect } from 'react';
import { Client, Wallet } from 'xrpl';
import XRPLClient from './scripts/xrpl-client';
import { createLoanFactory } from './scripts/contract';
import { XRPLWallet, LoanAgreement } from './scripts/types';

export default function Home() {
  const [xrplClient, setXrplClient] = useState<XRPLClient | null>(null);
  const [borrower, setBorrower] = useState<XRPLWallet | null>(null);
  const [lender, setLender] = useState<XRPLWallet | null>(null);
  const [principalAmount, setPrincipalAmount] = useState<string>('10');
  const [interestRate, setInterestRate] = useState<string>('5');
  const [duration, setDuration] = useState<string>('30');
  const [terms, setTerms] = useState<string>('');
  const [loans, setLoans] = useState<LoanAgreement[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    const initClient = async () => {
      try {
        const client = new XRPLClient();
        await client.connect();
        setXrplClient(client);
        setStatus('Connected to XRPL Testnet');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect to XRPL');
      }
    };

    initClient();
    return () => {
      if (xrplClient) {
        xrplClient.disconnect();
      }
    };
  }, []);

  const createTestAccounts = async () => {
    if (!xrplClient) return;
    
    setLoading(true);
    setError(null);
    try {
      const newBorrower = await xrplClient.createAccount('TestBorrower');
      const newLender = await xrplClient.createAccount('TestLender');
      
      setBorrower(newBorrower);
      setLender(newLender);
      setStatus('Test accounts created. Waiting for funding...');

      // Wait for accounts to be funded
      let borrowerFunded = false;
      let lenderFunded = false;
      
      while (!borrowerFunded || !lenderFunded) {
        const borrowerStatus = await xrplClient.checkAndUpdateFunding(newBorrower.address);
        const lenderStatus = await xrplClient.checkAndUpdateFunding(newLender.address);
        
        borrowerFunded = borrowerStatus.isFunded;
        lenderFunded = lenderStatus.isFunded;
        
        if (!borrowerFunded || !lenderFunded) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      setStatus('Test accounts funded successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create test accounts');
    } finally {
      setLoading(false);
    }
  };

  const createLoan = async () => {
    if (!xrplClient || !borrower || !lender) return;
    
    setLoading(true);
    setError(null);
    try {
      const loanFactory = createLoanFactory();
      const borrowerWallet = Wallet.fromSeed(borrower.seed);
      
      const result = await loanFactory.createLoan(
        borrowerWallet,
        lender.address,
        parseFloat(principalAmount),
        parseFloat(interestRate),
        parseInt(duration),
        terms
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create loan contract');
      }

      setStatus('Loan contract created successfully!');
      if (result.agreement) {
        setLoans(prev => [...prev, result.agreement!]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create loan contract');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalRepayment = (principal: number, rate: number) => {
    const interest = principal * (rate / 100);
    return (principal + interest).toFixed(2);
  };

  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">XRPL Loan Contract Test</h1>
        
        {status && (
          <div className="mb-4 p-4 bg-blue-100 text-blue-700 rounded">
            {status}
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="mb-8 p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Test Accounts</h2>
          <button
            onClick={createTestAccounts}
            disabled={loading || !!borrower}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          >
            {loading ? 'Creating...' : 'Create Test Accounts'}
          </button>
          
          {borrower && lender && (
            <div className="mt-4 space-y-2">
              <p><strong>Borrower:</strong> {borrower.address}</p>
              <p><strong>Lender:</strong> {lender.address}</p>
            </div>
          )}
        </div>

        {borrower && lender && (
          <div className="mb-8 p-6 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Create Loan Contract</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Principal Amount (XRP)</label>
                <input
                  type="number"
                  value={principalAmount}
                  onChange={(e) => setPrincipalAmount(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  min="1"
                  step="1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Interest Rate (%)</label>
                <input
                  type="number"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  min="0"
                  step="0.1"
                />
              </div>

              <div className="p-4 bg-gray-50 rounded">
                <p className="text-sm text-gray-600">
                  Total Repayment: {calculateTotalRepayment(parseFloat(principalAmount), parseFloat(interestRate))} XRP
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Duration (seconds)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  min="10"
                  step="1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Loan Terms</label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter loan terms..."
                />
              </div>
              
              <button
                onClick={createLoan}
                disabled={loading}
                className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
              >
                {loading ? 'Creating Loan...' : 'Create Loan Contract'}
              </button>
            </div>
          </div>
        )}

        {loans.length > 0 && (
          <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Active Loans</h2>
            <div className="space-y-4">
              {loans.map((loan) => (
                <div key={loan.id} className="p-4 border rounded">
                  <p><strong>Loan ID:</strong> {loan.id}</p>
                  <p><strong>Principal:</strong> {loan.principalAmount} XRP</p>
                  <p><strong>Interest Rate:</strong> {loan.interestRate}%</p>
                  <p><strong>Total Repayment:</strong> {loan.totalRepaymentAmount} XRP</p>
                  <p><strong>Status:</strong> {loan.status}</p>
                  <p><strong>Repayment Due:</strong> {new Date(loan.executeAt).toLocaleString()}</p>
                  {loan.terms && <p><strong>Terms:</strong> {loan.terms}</p>}
                  {loan.status === 'repaid' && loan.repaidAt && (
                    <p><strong>Repaid At:</strong> {new Date(loan.repaidAt).toLocaleString()}</p>
                  )}
                  {loan.status === 'defaulted' && (
                    <p className="text-red-600"><strong>Status:</strong> Defaulted</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
