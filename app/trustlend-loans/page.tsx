"use client";

import { useState, useEffect } from 'react';
import { Client, Wallet } from 'xrpl';
import XRPLClient from '../scripts/xrpl-client';
import { createLoanFactory } from '../scripts/contract';
import { createQuickDemoLoan, AutoLoanWalletManager } from '../scripts/wallet-functions';
import { XRPLWallet, LoanAgreement, CreditRequirement } from '../scripts/types';
import { CreditManager, initializeWalletCredits } from '../scripts/credit-manager';
import { useRouter } from 'next/navigation';
import LoadingOverlay from "../components/LoadingOverlay";

interface AccountStatus {
  account: XRPLWallet | null;
  balance: string;
  isFunded: boolean;
  lastUpdated: number;
  creditScore: number;
  creditTier: CreditRequirement;
}

export default function TrustLendLoansPage() {
  const [xrplClient, setXrplClient] = useState<XRPLClient | null>(null);
  const [activeWallet, setActiveWallet] = useState<XRPLWallet | null>(null);
  const [lenderWallet, setLenderWallet] = useState<XRPLWallet | null>(null);
  const [lenderAddress, setLenderAddress] = useState<string>("");
  const [showPeerInput, setShowPeerInput] = useState<boolean>(false);
  const [peerInput, setPeerInput] = useState<string>("");
  const [accountStatus, setAccountStatus] = useState<AccountStatus>({
    account: null,
    balance: '0',
    isFunded: false,
    lastUpdated: 0,
    creditScore: 100,
    creditTier: CreditManager.getCreditTier(100)
  });
  const [principalAmount, setPrincipalAmount] = useState<string>('10');
  const [interestRate, setInterestRate] = useState<string>('5');
  const [duration, setDuration] = useState<string>('30');
  const [terms, setTerms] = useState<string>('');
  const [loans, setLoans] = useState<LoanAgreement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const router = useRouter();

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setDebugLogs(prev => [...prev.slice(-9), logMessage]);
    console.log(logMessage);
  };

  useEffect(() => {
    // Initialize wallet credits for existing wallets
    initializeWalletCredits();
    
    // Redirect to login if not logged in or no active wallet
    if (typeof window !== 'undefined') {
      const wallets = localStorage.getItem('xrpl_wallets');
      const activeAddress = localStorage.getItem('xrpl_wallet_active');
      if (!wallets || !activeAddress) {
        router.replace('/login');
        return;
      }
      const parsedWallets: XRPLWallet[] = JSON.parse(wallets);
      const found = parsedWallets.find(w => w.address === activeAddress) || null;
      setActiveWallet(found);
      if (!found) {
        router.replace('/account');
        return;
      }
    }
    const initClient = async () => {
      setLoading(true);
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
      setLoading(false);
    };
    initClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!xrplClient || !activeWallet) return;
    const updateStatus = async () => {
      try {
        const fundingResult = await xrplClient.checkAndUpdateFunding(activeWallet.address);
        const creditScore = activeWallet.creditScore || 100;
        const creditTier = CreditManager.getCreditTier(creditScore);
        setAccountStatus({
          account: activeWallet,
          balance: fundingResult.balance,
          isFunded: fundingResult.isFunded,
          lastUpdated: Date.now(),
          creditScore,
          creditTier
        });
        addDebugLog(`${activeWallet.userName} balance: ${fundingResult.balance} XRP, funded: ${fundingResult.isFunded}, credit: ${CreditManager.formatCreditDisplay(creditScore)}`);
      } catch (err) {
        addDebugLog(`Failed to update status: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    updateStatus();
  }, [xrplClient, activeWallet]);

  // Fetch Lender (create wallet and use its address/seed)
  const handleFetchLender = async () => {
    setLoading(true);
    if (!xrplClient) return;
    setError(null);
    try {
      addDebugLog('Creating and funding lender wallet...');
      const wallet = await xrplClient.createAccount('DemoLender');
      
      // Check funding status
      const fundingStatus = await xrplClient.checkAndUpdateFunding(wallet.address);
      addDebugLog(`Lender wallet created: ${wallet.address}`);
      addDebugLog(`Lender balance: ${fundingStatus.balance} XRP, funded: ${fundingStatus.isFunded}`);
      
      if (!fundingStatus.isFunded) {
        addDebugLog('Warning: Lender wallet may not be properly funded');
      }
      
      setLenderWallet(wallet);
      setLenderAddress(wallet.address);
      setShowPeerInput(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create lender wallet';
      setError(errorMsg);
      addDebugLog(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  // Peer-to-peer: allow user to input lender address
  const handlePeerToPeer = () => {
    setShowPeerInput(true);
    setLenderAddress("");
    setLenderWallet(null);
  };
  const handleSetPeerAddress = () => {
    setLenderAddress(peerInput.trim());
    setLenderWallet(null);
    setShowPeerInput(false);
    addDebugLog(`Set peer-to-peer lender address: ${peerInput.trim()}`);
  };

  const checkCreditEligibility = (amount: number): { eligible: boolean; message: string } => {
    if (!accountStatus.account) {
      return { eligible: false, message: 'No active account' };
    }
    
    const eligibility = CreditManager.canTakeLoan(accountStatus.account, amount);
    return {
      eligible: eligibility.eligible,
      message: eligibility.message
    };
  };

  const createDemoAutoLoan = async () => {
    if (!xrplClient || !accountStatus.account || !lenderAddress) return;
    setLoading(true);
    setError(null);
    try {
      addDebugLog('Step 1: Starting demo loan creation');
      setStatus('Creating demo loan with automatic repayment...');
      
      // Check credit eligibility first
      addDebugLog('Step 2: Checking credit eligibility');
      const loanAmount = parseFloat(principalAmount);
      const eligibility = checkCreditEligibility(loanAmount);
      if (!eligibility.eligible) {
        throw new Error(`Credit check failed: ${eligibility.message}`);
      }
      addDebugLog(`Step 2a: Credit check passed - ${eligibility.message}`);
      
      // Check funding before proceeding
      addDebugLog('Step 3: Checking account funding');
      const fundingResult = await xrplClient.checkAndUpdateFunding(accountStatus.account.address);
      if (!fundingResult.isFunded || parseFloat(fundingResult.balance) < 10) {
        throw new Error(`Account is not funded or has insufficient XRP (balance: ${fundingResult.balance}). Please fund your wallet using the XRPL Testnet faucet.`);
      }
      addDebugLog('Step 4: Account is funded, calling createQuickDemoLoan');
      
      // Check borrower balance before loan
      const borrowerBalanceBefore = await xrplClient.getAccountBalance(accountStatus.account.address);
      addDebugLog(`Step 4a: Borrower balance before loan: ${borrowerBalanceBefore} XRP`);
      
      // Use lenderWallet if present (bank lender), otherwise use just the address (peer-to-peer)
      const lender = lenderWallet ? lenderWallet : { address: lenderAddress, seed: '', userName: 'Lender' };
      
      if (!lenderWallet && lenderAddress) {
        throw new Error('Peer-to-peer loans are not fully supported yet. Please use "Bank Lender" option.');
      }
      
      const loanAgreement = await createQuickDemoLoan(
        xrplClient,
        accountStatus.account,
        lender,
        loanAmount
      );
      
      // Check borrower balance after loan
      const borrowerBalanceAfter = await xrplClient.getAccountBalance(accountStatus.account.address);
      addDebugLog(`Step 5: Demo loan created: ${loanAgreement.id}`);
      addDebugLog(`Step 5a: Borrower balance after loan: ${borrowerBalanceAfter} XRP`);
      const balanceIncrease = parseFloat(borrowerBalanceAfter) - parseFloat(borrowerBalanceBefore);
      addDebugLog(`Step 5b: Balance increase: ${balanceIncrease.toFixed(6)} XRP`);
      addDebugLog(`Step 6: Auto-repayment scheduled for: ${new Date(loanAgreement.executeAt * 1000).toLocaleString()}`);
      setLoans(prev => [...prev, loanAgreement]);
      setStatus(`Demo loan created! Borrower received ${loanAmount} XRP. Will automatically repay in 10 seconds.`);
      
      // Update account status to show new balance
      const updatedFundingResult = await xrplClient.checkAndUpdateFunding(accountStatus.account.address);
      const updatedCreditScore = accountStatus.account.creditScore || 100;
      const updatedCreditTier = CreditManager.getCreditTier(updatedCreditScore);
      setAccountStatus(prev => ({
        ...prev,
        balance: updatedFundingResult.balance,
        isFunded: updatedFundingResult.isFunded,
        lastUpdated: Date.now(),
        creditScore: updatedCreditScore,
        creditTier: updatedCreditTier
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create demo loan';
      setError(errorMsg);
      addDebugLog(`Error: ${errorMsg}`);
      setStatus('Failed to create demo loan. See logs below.');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalRepayment = (principal: number, rate: number) => {
    const interest = principal * (rate / 100);
    return (principal + interest).toFixed(2);
  };

  const isReady = accountStatus.isFunded;

  return (
    <>
      {loading && <LoadingOverlay message="Loading..." />}
      <main className="min-h-screen p-8 bg-gray-100">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Request a Loan</h1>
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
          {/* Active Wallet Info */}
          {activeWallet && (
            <div className="mb-8 p-6 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Active Account</h2>
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-blue-700">{activeWallet.userName}</h3>
                <p className="text-sm font-mono break-all">{activeWallet.address}</p>
                <p className="mt-2">
                  <span className="font-medium">Balance:</span> {accountStatus.balance} XRP
                </p>
                <p>
                  <span className="font-medium">Status:</span>
                  <span className={`ml-1 ${accountStatus.isFunded ? 'text-green-600' : 'text-red-600'}`}>{accountStatus.isFunded ? '✓ Funded' : '○ Needs Funding'}</span>
                </p>
                <p>
                  <span className="font-medium">Credit Score:</span> {CreditManager.formatCreditDisplay(accountStatus.creditScore)}
                </p>
                <p>
                  <span className="font-medium">Max Loan:</span> {accountStatus.creditTier.maxLoanAmount} XRP
                </p>
                <a href="/account" className="inline-block mt-2 px-3 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300">Switch Account</a>
              </div>
            </div>
          )}
          {/* Lender Selection */}
          <div className="mb-8 p-6 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Choose Lender</h2>
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <button
                onClick={handleFetchLender}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled={loading}
              >
                Bank
              </button>
              <span className="text-gray-500">or</span>
              <button
                onClick={handlePeerToPeer}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                disabled={loading}
              >
                Peer-to-Peer
              </button>
            </div>
            {showPeerInput && (
              <div className="mt-4 flex gap-2 items-center">
                <input
                  type="text"
                  value={peerInput}
                  onChange={e => setPeerInput(e.target.value)}
                  className="p-2 border rounded bg-gray-50 flex-1"
                  placeholder="Enter lender address"
                />
                <button
                  onClick={handleSetPeerAddress}
                  className="px-3 py-2 bg-blue-400 text-white rounded hover:bg-blue-500"
                  disabled={!peerInput.trim()}
                >
                  Set
                </button>
              </div>
            )}
            {lenderAddress && (
              <div className="mt-4 p-2 bg-gray-100 border rounded">
                <span className="font-mono text-xs">Lender: {lenderAddress}</span>
                <span className="ml-2 text-green-700">✓ Ready</span>
              </div>
            )}
          </div>
          {/* Loan Creation Form */}
          {isReady && lenderAddress && (
            <div className="mb-8 p-6 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Create Loan Contract</h2>
              {/* Credit Eligibility Check */}
              {(() => {
                const loanAmount = parseFloat(principalAmount) || 0;
                const eligibility = checkCreditEligibility(loanAmount);
                return (
                  <div className={`mb-4 p-4 rounded-lg ${eligibility.eligible ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <h3 className="text-sm font-semibold mb-2">Credit Check</h3>
                    <p className={`text-sm ${eligibility.eligible ? 'text-green-700' : 'text-red-700'}`}>
                      {eligibility.message}
                    </p>
                    {!eligibility.eligible && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-600">
                          Complete successful loans to increase your credit score and access higher loan amounts.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Principal Amount (XRP)</label>
                  <input
                    type="number"
                    value={principalAmount}
                    onChange={(e) => setPrincipalAmount(e.target.value)}
                    className="mt-1 p-1 block w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    min="1"
                    max={accountStatus.creditTier.maxLoanAmount}
                    step="1"
                    placeholder={`Enter amount (max: ${accountStatus.creditTier.maxLoanAmount} XRP)`}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Your {accountStatus.creditTier.description} credit tier allows loans up to {accountStatus.creditTier.maxLoanAmount} XRP
                  </p>
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
                    1. Lender transfers <span className="font-semibold text-green-600">{principalAmount} XRP</span> to borrower
                  </p>
                  <p className="text-sm text-gray-600">
                    2. Borrower's balance increases by {principalAmount} XRP
                  </p>
                  <p className="text-sm text-gray-600">
                    3. System creates automatic repayment hook
                  </p>
                  <p className="text-sm text-gray-600">
                    4. Borrower will auto-repay <span className="font-semibold text-red-600">{calculateTotalRepayment(parseFloat(principalAmount), parseFloat(interestRate))} XRP</span>
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    <strong>Note:</strong> In this demo, repayment happens automatically in 10 seconds
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
                  disabled={loading || !isReady || !lenderAddress || !checkCreditEligibility(parseFloat(principalAmount) || 0).eligible}
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
          
          {/* Credit Tiers Information */}
          <div className="p-6 mb-6 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Credit Tiers</h2>
            <p className="text-sm text-gray-600 mb-4">
              Build your credit score by successfully repaying loans to unlock higher loan amounts.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {CreditManager.getAllTiers().map((tier, index) => {
                const isCurrent = accountStatus.creditScore >= tier.minCreditScore && 
                                (index === CreditManager.getAllTiers().length - 1 || 
                                 accountStatus.creditScore < CreditManager.getAllTiers()[index + 1].minCreditScore);
                return (
                  <div key={tier.description} className={`p-4 border rounded-lg ${isCurrent ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className={`font-semibold ${isCurrent ? 'text-blue-700' : 'text-gray-700'}`}>
                        {tier.description}
                        {isCurrent && <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">Current</span>}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600">
                      Min Score: {tier.minCreditScore}
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      Max Loan: {tier.maxLoanAmount} XRP
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-700 mb-2">How to Build Credit</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Successfully repay loans on time to earn credit points</li>
                <li>• Earn approximately 2 points per XRP repaid</li>
                <li>• Minimum 10 points per successful loan, maximum 100 points</li>
                <li>• Higher loan amounts = more credit points earned</li>
              </ul>
            </div>
          </div>
          
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