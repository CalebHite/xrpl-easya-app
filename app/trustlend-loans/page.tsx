"use client";

import { useState, useEffect } from 'react';
import { Client, Wallet } from 'xrpl';
import XRPLClient from '../scripts/xrpl-client';
import { createLoanFactory } from '../scripts/contract';
import { createQuickDemoLoan, AutoLoanWalletManager } from '../scripts/wallet-functions';
import { XRPLWallet, LoanAgreement } from '../scripts/types';

interface AccountStatus {
  account: XRPLWallet | null;
  balance: string;
  isFunded: boolean;
  lastUpdated: number;
}

export default function TrustLendLoansPage() {
  const [xrplClient, setXrplClient] = useState<XRPLClient | null>(null);
  const [borrowerStatus, setBorrowerStatus] = useState<AccountStatus>({
    account: null,
    balance: '0',
    isFunded: false,
    lastUpdated: 0
  });
  const [lenderStatus, setLenderStatus] = useState<AccountStatus>({
    account: null,
    balance: '0',
    isFunded: false,
    lastUpdated: 0
  });
  const [principalAmount, setPrincipalAmount] = useState<string>('10');
  const [interestRate, setInterestRate] = useState<string>('5');
  const [duration, setDuration] = useState<string>('30');
  const [terms, setTerms] = useState<string>('');
  const [loans, setLoans] = useState<LoanAgreement[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setDebugLogs(prev => [...prev.slice(-9), logMessage]);
    console.log(logMessage);
  };
  const bankAddress = 'rBpUwvkJfrnRrwGcbLk5TwuAFd8SbxmD4M'; // Permanent XRP address for the bank/lender

  useEffect(() => {
    const initClient = async () => {
      try {
        const client = new XRPLClient();
        await client.connect();
        setXrplClient(client);
        setStatus('Connected to XRPL Testnet');
        addDebugLog('XRPL Client connected successfully');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to connect to XRPL';
        setError(errorMsg);
        addDebugLog(`Connection failed: ${errorMsg}`);
      }
    };

    initClient();
    return () => {
      if (xrplClient) {
        xrplClient.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAccountStatus = async (account: XRPLWallet, setter: React.Dispatch<React.SetStateAction<AccountStatus>>) => {
    if (!xrplClient) return;
    
    try {
      const fundingResult = await xrplClient.checkAndUpdateFunding(account.address);
      setter({
        account,
        balance: fundingResult.balance,
        isFunded: fundingResult.isFunded,
        lastUpdated: Date.now()
      });
      addDebugLog(`${account.userName} balance: ${fundingResult.balance} XRP, funded: ${fundingResult.isFunded}`);
      return fundingResult;
    } catch (err) {
      addDebugLog(`Failed to update ${account.userName} status: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err;
    }
  };

  const createTestAccounts = async () => {
    if (!xrplClient) return;
    setLoading(true);
    setError(null);
    setDebugLogs([]);
    
    try {
      addDebugLog('Creating borrower and lender accounts...');
      setStatus('Creating test accounts...');

      // Create both accounts simultaneously
      const [newBorrower, newLender] = await Promise.all([
        xrplClient.createAccount('TestBorrower'),
        xrplClient.createAccount('TestLender')
      ]);

      addDebugLog(`Borrower created: ${newBorrower.address}`);
      addDebugLog(`Lender created: ${newLender.address}`);

      // Update initial status for both accounts
      await Promise.all([
        updateAccountStatus(newBorrower, setBorrowerStatus),
        updateAccountStatus(newLender, setLenderStatus)
      ]);

      setStatus('Accounts created. Checking funding status...');

      // Wait for both accounts to be properly funded
      let borrowerReady = false;
      let lenderReady = false;
      let attempts = 0;
      const maxAttempts = 10;

      while ((!borrowerReady || !lenderReady) && attempts < maxAttempts) {
        attempts++;
        addDebugLog(`Funding check attempt ${attempts}/${maxAttempts}`);
        
        if (!borrowerReady) {
          const borrowerResult = await updateAccountStatus(newBorrower, setBorrowerStatus);
          borrowerReady = borrowerResult?.isFunded || false;
        }
        
        if (!lenderReady) {
          const lenderResult = await updateAccountStatus(newLender, setLenderStatus);
          lenderReady = lenderResult?.isFunded || false;
        }

        if (!borrowerReady || !lenderReady) {
          setStatus(`Waiting for funding... Borrower: ${borrowerReady ? '✓' : '○'}, Lender: ${lenderReady ? '✓' : '○'}`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      if (borrowerReady && lenderReady) {
        setStatus('Both accounts created and funded successfully!');
        addDebugLog('Both accounts are ready for loan creation');
      } else {
        throw new Error(`Failed to fund accounts after ${maxAttempts} attempts. Borrower: ${borrowerReady}, Lender: ${lenderReady}`);
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create test accounts';
      setError(errorMsg);
      addDebugLog(`Account creation failed: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const createLoan = async () => {
    if (!xrplClient || !borrowerStatus.account || !lenderStatus.account) return;
    setLoading(true);
    setError(null);
    
    try {
      const lenderRequiredAmount = parseFloat(principalAmount) + 5; // Principal + buffer for fees
      const borrowerRequiredAmount = 5; // Just enough for transaction fees
      
      addDebugLog(`Starting loan creation`);
      addDebugLog(`Borrower balance: ${borrowerStatus.balance} XRP (needs ~${borrowerRequiredAmount} XRP for fees)`);
      addDebugLog(`Lender balance: ${lenderStatus.balance} XRP (needs ${lenderRequiredAmount} XRP to fund loan)`);

      // Verify both accounts have sufficient funds for their roles
      if (parseFloat(borrowerStatus.balance) < borrowerRequiredAmount) {
        throw new Error(`Borrower needs at least ${borrowerRequiredAmount} XRP for transaction fees. Current: ${borrowerStatus.balance} XRP`);
      }

      if (parseFloat(lenderStatus.balance) < lenderRequiredAmount) {
        throw new Error(`Lender needs at least ${lenderRequiredAmount} XRP to fund the loan. Current: ${lenderStatus.balance} XRP`);
      }

      setStatus('Creating loan contract...');
      addDebugLog('All pre-checks passed, creating loan contract');

      const loanFactory = createLoanFactory(xrplClient);
      const borrowerWallet = Wallet.fromSeed(borrowerStatus.account.seed);
      const lenderWallet = Wallet.fromSeed(lenderStatus.account.seed);
      
      addDebugLog(`Loan params: ${principalAmount} XRP, ${interestRate}%, ${duration} days`);
      
      const result = await loanFactory.createLoan(
        borrowerWallet,
        lenderWallet,
        parseFloat(principalAmount),
        parseFloat(interestRate),
        parseInt(duration) * 86400, // Convert days to seconds
        terms
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create loan contract');
      }

      addDebugLog(`Loan contract created successfully. ID: ${result.contractId}`);
      setStatus('Loan contract created successfully!');
      
      if (result.agreement) {
        setLoans(prev => [...prev, result.agreement!]);
      }

    } catch (err) {
      let errorMsg = err instanceof Error ? err.message : 'Failed to create loan contract';
      if (errorMsg === 'failed to loan principle') {
        errorMsg = 'Lender does not have enough XRP for transaction.';
      }
      setError(errorMsg);
      addDebugLog(`Loan creation failed: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshAccountStatus = async () => {
    if (!xrplClient || (!borrowerStatus.account && !lenderStatus.account)) return;
    
    try {
      const updates = [];
      if (borrowerStatus.account) {
        updates.push(updateAccountStatus(borrowerStatus.account, setBorrowerStatus));
      }
      if (lenderStatus.account) {
        updates.push(updateAccountStatus(lenderStatus.account, setLenderStatus));
      }
      await Promise.all(updates);
    } catch (err) {
      addDebugLog(`Failed to refresh account status: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const createDemoAutoLoan = async () => {
    if (!xrplClient || !borrowerStatus.account || !lenderStatus.account) return;
    setLoading(true);
    setError(null);
    
    try {
      addDebugLog('Creating DEMO auto-repayment loan (30 seconds)');
      setStatus('Creating demo loan with automatic repayment...');

      const loanAgreement = await createQuickDemoLoan(
        xrplClient,
        borrowerStatus.account,
        lenderStatus.account,
        parseFloat(principalAmount)
      );

      addDebugLog(`Demo loan created: ${loanAgreement.id}`);
      addDebugLog(`Auto-repayment scheduled for: ${new Date(loanAgreement.executeAt * 1000).toLocaleString()}`);
      
      setLoans(prev => [...prev, loanAgreement]);
      setStatus('Demo loan created! Will automatically repay in 30 seconds.');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create demo loan';
      setError(errorMsg);
      addDebugLog(`Demo loan creation failed: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalRepayment = (principal: number, rate: number) => {
    const interest = principal * (rate / 100);
    return (principal + interest).toFixed(2);
  };

  const bothAccountsReady = borrowerStatus.isFunded && lenderStatus.isFunded;

  return (
    <>
      <main className="min-h-screen p-8 bg-gray-100">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">TrustLend Loans</h1>
          
          {status && (
            <div className="mb-4 p-4 bg-blue-100 text-blue-700 rounded">
              {status}
            </div>
          )}
          
          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Account Creation */}
          <div className="mb-8 p-6 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Create Test Accounts</h2>
            <p className="mb-4 p-2 bg-yellow-100 border border-yellow-300 rounded"><strong>Bank/Lender Address:</strong> {bankAddress}</p>
            <button
              onClick={createTestAccounts}
              disabled={loading || bothAccountsReady || !xrplClient}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {loading ? 'Creating...' : 'Create Borrower & Lender Accounts'}
            </button>
            
            {(borrowerStatus.account || lenderStatus.account) && (
              <div className="mt-4">
                <button
                  onClick={refreshAccountStatus}
                  disabled={loading}
                  className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 disabled:bg-gray-400"
                >
                  Refresh Status
                </button>
              </div>
            )}
          </div>

          {/* Account Status Display */}
          {(borrowerStatus.account || lenderStatus.account) && (
            <div className="mb-8 p-6 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Account Status</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {borrowerStatus.account && (
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold text-green-700">Borrower Account</h3>
                    <p className="text-sm font-mono break-all">{borrowerStatus.account.address}</p>
                    <p className="mt-2">
                      <span className="font-medium">Balance:</span> {borrowerStatus.balance} XRP
                    </p>
                    <p>
                      <span className="font-medium">Status:</span> 
                      <span className={`ml-1 ${borrowerStatus.isFunded ? 'text-green-600' : 'text-red-600'}`}>
                        {borrowerStatus.isFunded ? '✓ Funded' : '○ Needs Funding'}
                      </span>
                    </p>
                  </div>
                )}
                
                {lenderStatus.account && (
                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold text-blue-700">Lender Account</h3>
                    <p className="text-sm font-mono break-all">{lenderStatus.account.address}</p>
                    <p className="mt-2">
                      <span className="font-medium">Balance:</span> {lenderStatus.balance} XRP
                    </p>
                    <p>
                      <span className="font-medium">Status:</span> 
                      <span className={`ml-1 ${lenderStatus.isFunded ? 'text-green-600' : 'text-red-600'}`}>
                        {lenderStatus.isFunded ? '✓ Funded' : '○ Needs Funding'}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loan Creation Form */}
          {bothAccountsReady && (
            <div className="mb-8 p-6 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Create Loan Contract</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Principal Amount (XRP)</label>
                  <input
                    type="number"
                    value={principalAmount}
                    onChange={(e) => setPrincipalAmount(e.target.value)}
                    className="mt-1 p-1 block w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    min="1"
                    step="1"
                    placeholder="Enter principal amount in XRP"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Interest Rate (%)</label>
                  <input
                    type="number"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="mt-1 p-1 block w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    min="0"
                    step="0.1"
                    placeholder="Enter interest rate (%)"
                  />
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <p className="text-sm text-gray-600">
                    <strong>Loan Flow:</strong>
                  </p>
                  <p className="text-sm text-gray-600">
                    1. Borrower records loan agreement (small fee)
                  </p>
                  <p className="text-sm text-gray-600">
                    2. Lender sends {principalAmount} XRP to borrower
                  </p>
                  <p className="text-sm text-gray-600">
                    3. Borrower will repay {calculateTotalRepayment(parseFloat(principalAmount), parseFloat(interestRate))} XRP
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    <strong>Required:</strong> Lender needs {(parseFloat(principalAmount) + 5).toFixed(2)} XRP minimum
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Duration (days)</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="mt-1 p-1 block w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    min="1"
                    step="1"
                    placeholder="Enter duration in days"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Loan Terms</label>
                  <textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    className="mt-1 p-1 block w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    rows={3}
                    placeholder="Enter loan terms..."
                  />
                </div>
                <button
                  onClick={createDemoAutoLoan}
                  disabled={loading || !bothAccountsReady}
                  className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
                >
                  {loading ? 'Creating Loan...' : 'Create Loan Contract'}
                </button>
              </div>
            </div>
          )}

          {/* Active Loans */}
          {loans.length > 0 && (
            <div className="p-6 mb-6 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Active Loans</h2>
              <div className="space-y-4">
                {loans.map((loan) => (
                  <div key={loan.id} className="p-4 border rounded">
                    <p><strong>Loan ID:</strong> {loan.id}</p>
                    <p><strong>Principal:</strong> {loan.principalAmount} XRP</p>
                    <p><strong>Interest Rate:</strong> {loan.interestRate}%</p>
                    <p><strong>Total Repayment:</strong> {loan.totalRepaymentAmount} XRP</p>
                    <p><strong>Status:</strong> {loan.status}</p>
                    <p><strong>Repayment Due:</strong> {new Date(loan.executeAt * 1000).toLocaleString()}</p>
                    {loan.terms && <p><strong>Terms:</strong> {loan.terms}</p>}
                    {loan.status === 'repaid' && loan.repaidAt && (
                      <p><strong>Repaid At:</strong> {new Date(loan.repaidAt * 1000).toLocaleString()}</p>
                    )}
                    {loan.status === 'defaulted' && (
                      <p className="text-red-600"><strong>Status:</strong> Defaulted</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Debug Logs */}
          {debugLogs.length > 0 && (
            <details className="mb-6">
              <summary className="p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                <h3 className="text-sm font-semibold inline">Logs</h3>
              </summary>
              <div className="p-4 bg-gray-50 rounded-lg mt-1">
                <div className="text-xs font-mono space-y-1 max-h-40 overflow-y-auto">
                  {debugLogs.map((log, index) => (
                    <div key={index} className="text-gray-600">{log}</div>
                  ))}
                </div>
              </div>
            </details>
          )}
        </div>
      </main>
    </>
  );
} 