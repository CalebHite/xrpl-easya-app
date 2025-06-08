import { Wallet, xrpToDrops, dropsToXrp } from 'xrpl';
import XRPLClient from './xrpl-client';
import { AutoRepaymentLoanFactory } from './contract';
import { XRPLWallet, LoanAgreement } from './types';
import { CreditManager, updateWalletCreditInStorage } from './credit-manager';

export class AutoLoanWalletManager {
  private xrplClient: XRPLClient;
  private loanFactory: AutoRepaymentLoanFactory;
  
  constructor(xrplClient: XRPLClient) {
    this.xrplClient = xrplClient;
    this.loanFactory = new AutoRepaymentLoanFactory(xrplClient);
    
    // Set up credit update callback
    this.loanFactory.setOnLoanRepaidCallback((loan: LoanAgreement) => {
      this.handleLoanRepayment(loan);
    });
  }

  /**
   * Handle loan repayment and update borrower's credit score
   */
  private handleLoanRepayment(loan: LoanAgreement): void {
    try {
      // Get borrower wallet from localStorage
      if (typeof window !== 'undefined') {
        const walletsData = localStorage.getItem('xrpl_wallets');
        if (walletsData) {
          const wallets: XRPLWallet[] = JSON.parse(walletsData);
          const borrowerWallet = wallets.find(w => w.address === loan.borrowerAddress);
          
          if (borrowerWallet) {
            const creditUpdate = CreditManager.updateCreditScore(borrowerWallet, loan.principalAmount);
            updateWalletCreditInStorage(borrowerWallet.address, creditUpdate.newScore);
            
            console.log(`Credit updated for ${borrowerWallet.userName}:`);
            console.log(`- Previous score: ${creditUpdate.oldScore}`);
            console.log(`- New score: ${creditUpdate.newScore} (+${creditUpdate.increase})`);
            console.log(`- New tier: ${creditUpdate.newTier.description} (max loan: ${creditUpdate.newTier.maxLoanAmount} XRP)`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to update credit score:', error);
    }
  }

  /**
   * Create a loan with automatic repayment after deadline
   */
  async createAutoRepaymentLoan(
    borrower: XRPLWallet,
    lender: XRPLWallet,
    principalAmount: number,
    interestRate: number,
    durationInDays: number,
    terms: string = 'Standard auto-repayment loan'
  ): Promise<LoanAgreement> {
    
    const borrowerWallet = Wallet.fromSeed(borrower.seed);
    const lenderWallet = Wallet.fromSeed(lender.seed);
    const durationInSeconds = durationInDays * 24 * 60 * 60; // Convert days to seconds

    console.log(`Creating auto-repayment loan:`);
    console.log(`- Borrower: ${borrower.address}`);
    console.log(`- Lender: ${lender.address}`);
    console.log(`- Principal: ${principalAmount} XRP`);
    console.log(`- Interest Rate: ${interestRate}%`);
    console.log(`- Duration: ${durationInDays} days`);
    console.log(`- Auto-repayment date: ${new Date(Date.now() + durationInSeconds * 1000).toLocaleString()}`);

    const result = await this.loanFactory.createLoan(
      borrowerWallet,
      lenderWallet,
      principalAmount,
      interestRate,
      durationInSeconds,
      terms
    );

    if (!result.success || !result.agreement) {
      throw new Error(result.error || 'Failed to create loan');
    }

    return result.agreement;
  }

  /**
   * Create a simple loan that automatically pays back after 10 seconds (for demo purposes)
   */
  async createDemoLoan(
    borrower: XRPLWallet,
    lender: XRPLWallet,
    principalAmount: number,
    interestRate: number = 10
  ): Promise<LoanAgreement> {
    console.log(`Creating DEMO loan with 10 second auto-repayment for testing`);
    
    const borrowerWallet = Wallet.fromSeed(borrower.seed);
    const lenderWallet = Wallet.fromSeed(lender.seed);
    const durationInSeconds = 10; // 10 seconds for demo

    const result = await this.loanFactory.createLoan(
      borrowerWallet,
      lenderWallet,
      principalAmount,
      interestRate,
      durationInSeconds,
      'Demo loan - auto-repayment in 10 seconds'
    );

    if (!result.success || !result.agreement) {
      throw new Error(result.error || 'Failed to create demo loan');
    }

    console.log(`Demo loan created! Will auto-repay in 10 seconds.`);
    return result.agreement;
  }

  /**
   * Check if a wallet has sufficient balance for loan operations
   */
  async checkWalletBalance(walletAddress: string, requiredAmount: number): Promise<boolean> {
    const balance = await this.xrplClient.getAccountBalance(walletAddress);
    const balanceXRP = parseFloat(balance);
    return balanceXRP >= requiredAmount;
  }

  /**
   * Get all active loans for a specific address (as borrower or lender)
   */
  async getLoansForAddress(address: string): Promise<LoanAgreement[]> {
    const allLoans = this.loanFactory.getAllActiveLoans();
    return allLoans.filter(loan => 
      loan.borrowerAddress === address || loan.lenderAddress === address
    );
  }

  /**
   * Manually repay a loan before the automatic deadline
   */
  async repayLoanEarly(loanId: string, borrower: XRPLWallet): Promise<boolean> {
    const borrowerWallet = Wallet.fromSeed(borrower.seed);
    const success = await this.loanFactory.manualRepayment(loanId, borrowerWallet);
    
    if (success) {
      console.log(`Loan ${loanId} repaid early by borrower`);
    } else {
      console.log(`Failed to repay loan ${loanId} early`);
    }
    
    return success;
  }

  /**
   * Get loan details by ID
   */
  getLoanDetails(loanId: string): LoanAgreement | undefined {
    return this.loanFactory.getActiveLoan(loanId);
  }

  /**
   * Check loan status and time remaining until auto-repayment
   */
  getLoanStatus(loanId: string): {
    loan?: LoanAgreement;
    timeUntilRepayment?: number;
    isOverdue?: boolean;
    status: string;
  } {
    const loan = this.loanFactory.getActiveLoan(loanId);
    
    if (!loan) {
      return { status: 'not_found' };
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilRepayment = loan.executeAt - currentTime;
    const isOverdue = timeUntilRepayment < 0;

    return {
      loan,
      timeUntilRepayment: Math.max(0, timeUntilRepayment),
      isOverdue,
      status: loan.status
    };
  }

  /**
   * Format loan information for display
   */
  formatLoanInfo(loan: LoanAgreement): string {
    const repaymentDate = new Date(loan.executeAt * 1000);
    const currentTime = Date.now();
    const timeUntilRepayment = loan.executeAt * 1000 - currentTime;
    
    let timeString = '';
    if (timeUntilRepayment > 0) {
      const days = Math.floor(timeUntilRepayment / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeUntilRepayment % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeUntilRepayment % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeUntilRepayment % (1000 * 60)) / 1000);
      
      if (days > 0) {
        timeString = `${days}d ${hours}h ${minutes}m`;
      } else if (hours > 0) {
        timeString = `${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        timeString = `${minutes}m ${seconds}s`;
      } else {
        timeString = `${seconds}s`;
      }
    } else {
      timeString = 'Overdue';
    }

    return `
Loan ID: ${loan.id}
Principal: ${loan.principalAmount} XRP
Interest Rate: ${loan.interestRate}%
Total Repayment: ${loan.totalRepaymentAmount} XRP
Status: ${loan.status}
Automatic Repayment: ${repaymentDate.toLocaleString()}
Time Remaining: ${timeString}
Borrower: ${loan.borrowerAddress}
Lender: ${loan.lenderAddress}
Hook Account: ${loan.hookAccountId}
${loan.terms ? `Terms: ${loan.terms}` : ''}
    `.trim();
  }
}

/**
 * Simple function to create an auto-repayment loan
 */
export async function createSimpleAutoLoan(
  xrplClient: XRPLClient,
  borrower: XRPLWallet,
  lender: XRPLWallet,
  amount: number,
  durationInDays: number = 1
): Promise<LoanAgreement> {
  const walletManager = new AutoLoanWalletManager(xrplClient);
  return await walletManager.createAutoRepaymentLoan(
    borrower,
    lender,
    amount,
    10, // 10% default interest rate
    durationInDays
  );
}

/**
 * Demo function to create a loan that auto-repays in 30 seconds
 */
export async function createQuickDemoLoan(
  xrplClient: XRPLClient,
  borrower: XRPLWallet,
  lender: XRPLWallet,
  amount: number
): Promise<LoanAgreement> {
  const walletManager = new AutoLoanWalletManager(xrplClient);
  return await walletManager.createDemoLoan(borrower, lender, amount);
}
