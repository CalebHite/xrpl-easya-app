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

      setStatus('Test account funded successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create test account');
    } finally {
      setLoading(false);
    }
  };

  const createLoan = async () => {
    if (!xrplClient || !borrower || !lender) return;
    
    setLoading(true);
    setError(null);
    try {
      const loanFactory = createLoanFactory(xrplClient);
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
    <>
      {/* Main content for Home page */}
      <main className="min-h-screen p-8 bg-gray-100">
        <div className="max-w-4xl mx-auto text-center mt-24">
          <h1 className="text-4xl font-bold mb-4 text-blue-700">Welcome to TrustLend</h1>
          <p className="text-lg text-gray-700 mb-8">A decentralized platform for creating and managing loans on the XRP Ledger.</p>
          <div className="flex justify-center space-x-4">
            <a href="/trustlend-loans" className="px-6 py-3 bg-blue-500 text-white rounded text-lg font-medium hover:bg-blue-600">Request a Loan</a>
          </div>
        </div>
      </main>
    </>
  );
}
