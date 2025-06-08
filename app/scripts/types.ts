import { Wallet } from 'xrpl';

export interface XRPLWallet {
  address: string;
  seed: string;  
  userName: string;
}

export interface LoanAgreement {
  id: string;
  borrowerAddress: string;
  lenderAddress: string;
  principalAmount: number;
  interestRate: number;
  totalRepaymentAmount: number;
  duration: number; // in seconds
  executeAt: number; // Unix timestamp when repayment is due
  createdAt: number; // Unix timestamp when loan was created
  status: 'active' | 'repaid' | 'defaulted';
  terms: string;
  repaidAt?: number; // Unix timestamp when repaid
  txHash?: string; // Transaction hash for loan creation
}

export interface LoanCreationResult {
  success: boolean;
  error?: string;
  agreement?: LoanAgreement;
  contractId?: string;
  txHash?: string;
  hookAccountId?: string;
}

export interface FundingStatus {
  balance: string;
  isFunded: boolean;
}

export interface AutoLoanHook {
  borrowerAddress: string;
  lenderAddress: string;
  repaymentAmount: number;
  executeAt: number;
  isActive: boolean;
  borrowerWallet?: Wallet;
}

export interface HookTransaction {
  Account: string;
  TransactionType: string;
  Destination?: string;
  Amount?: string;
  Sequence?: number;
  Fee?: string;
  Flags?: number;
  LastLedgerSequence?: number;
} 