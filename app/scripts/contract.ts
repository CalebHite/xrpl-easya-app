import { Wallet, xrpToDrops } from 'xrpl';
import XRPLClient from './xrpl-client';
import { LoanAgreement, LoanCreationResult, AutoLoanHook, HookTransaction } from './types';

export class AutoRepaymentLoanFactory {
  private xrplClient: XRPLClient;
  private activeLoans: Map<string, LoanAgreement> = new Map();
  private activeHooks: Map<string, AutoLoanHook> = new Map();

  constructor(xrplClient: XRPLClient) {
    this.xrplClient = xrplClient;
  }

  async createLoan(
    borrowerWallet: Wallet,
    lenderWallet: Wallet,
    principalAmount: number,
    interestRate: number,
    durationInSeconds: number,
    terms: string
  ): Promise<LoanCreationResult> {
    try {
      const loanId = this.generateLoanId();
      const currentTime = Math.floor(Date.now() / 1000);
      const executeAt = currentTime + durationInSeconds;
      const totalRepaymentAmount = principalAmount + (principalAmount * interestRate / 100);

      console.log(`Creating loan ${loanId} with scheduled repayment`);
      console.log(`Loan details: ${principalAmount} XRP principal, ${totalRepaymentAmount} XRP total repayment`);

      // Step 1: Check lender has sufficient balance
      const lenderBalance = await this.xrplClient.getAccountBalance(lenderWallet.address);
      const lenderBalanceNum = parseFloat(lenderBalance);
      console.log(`Lender balance: ${lenderBalance} XRP`);
      
      if (lenderBalanceNum < principalAmount + 2) { // Need principal + fees
        throw new Error(`Lender has insufficient balance. Has: ${lenderBalance} XRP, needs: ${principalAmount + 2} XRP`);
      }

      // Step 2: Transfer principal from lender to borrower
      console.log(`Transferring ${principalAmount} XRP from lender (${lenderWallet.address}) to borrower (${borrowerWallet.address})`);
      const loanTransferResult = await this.xrplClient.sendPayment(
        lenderWallet,
        borrowerWallet.address,
        principalAmount.toString()
      );

      console.log(`Loan transfer result: ${loanTransferResult.result.meta.TransactionResult}`);
      if (loanTransferResult.result.meta.TransactionResult !== 'tesSUCCESS') {
        throw new Error(`Failed to transfer loan principal: ${loanTransferResult.result.meta.TransactionResult}`);
      }

      // Step 3: Create loan agreement
      const loanAgreement: LoanAgreement = {
        id: loanId,
        borrowerAddress: borrowerWallet.address,
        lenderAddress: lenderWallet.address,
        principalAmount,
        interestRate,
        totalRepaymentAmount,
        duration: durationInSeconds,
        executeAt,
        createdAt: currentTime,
        status: 'active',
        terms,
        txHash: loanTransferResult.result.hash
      };

      // Store the loan information
      this.activeLoans.set(loanId, loanAgreement);
      this.activeHooks.set(loanId, {
        borrowerAddress: borrowerWallet.address,
        lenderAddress: lenderWallet.address,
        repaymentAmount: totalRepaymentAmount,
        executeAt,
        isActive: true,
        borrowerWallet
      });

      // Start monitoring for scheduled repayment
      this.startHookMonitoring(loanId);

      console.log(`Loan ${loanId} created successfully with scheduled repayment`);

      return {
        success: true,
        agreement: loanAgreement,
        contractId: loanId,
        txHash: loanTransferResult.result.hash
      };

    } catch (error) {
      console.error('Failed to create loan:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private startHookMonitoring(loanId: string): void {
    const hook = this.activeHooks.get(loanId);
    const loan = this.activeLoans.get(loanId);
    
    if (!hook || !loan) return;

    // Set up a timer to execute the scheduled repayment
    const timeUntilExecution = (hook.executeAt * 1000) - Date.now();
    
    if (timeUntilExecution > 0) {
      setTimeout(async () => {
        await this.executeAutomaticRepayment(loanId);
      }, timeUntilExecution);
      
      console.log(`Scheduled repayment for loan ${loanId} in ${Math.round(timeUntilExecution / 1000)} seconds`);
    } else {
      // Loan is already past due
      this.executeAutomaticRepayment(loanId);
    }
  }

  private async executeAutomaticRepayment(loanId: string): Promise<void> {
    const hook = this.activeHooks.get(loanId);
    const loan = this.activeLoans.get(loanId);
    
    if (!hook || !loan || !hook.isActive) {
      console.log(`Skipping scheduled repayment for loan ${loanId} - not active`);
      return;
    }

    try {
      console.log(`Executing scheduled repayment for loan ${loanId}`);
      // Attempt repayment from borrower to lender
      const repaymentResult = await this.xrplClient.sendPayment(
        hook.borrowerWallet,
        loan.lenderAddress,
        hook.repaymentAmount.toString()
      );

      if (repaymentResult.result.meta.TransactionResult === 'tesSUCCESS') {
        // Update loan status
        loan.status = 'repaid';
        loan.repaidAt = Math.floor(Date.now() / 1000);
        hook.isActive = false;
        console.log(`Loan ${loanId} repaid successfully`);
      } else {
        throw new Error('Repayment transaction failed');
      }
    } catch (error) {
      console.error(`Scheduled repayment failed for loan ${loanId}:`, error);
      if (loan) loan.status = 'defaulted';
      if (hook) hook.isActive = false;
    }
  }

  private generateLoanId(): string {
    return `loan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getActiveLoan(loanId: string): LoanAgreement | undefined {
    return this.activeLoans.get(loanId);
  }

  public getAllActiveLoans(): LoanAgreement[] {
    return Array.from(this.activeLoans.values()).filter(loan => loan.status === 'active');
  }

  public getActiveHook(loanId: string): AutoLoanHook | undefined {
    return this.activeHooks.get(loanId);
  }

  // Manual repayment method (in case borrower wants to pay early)
  async manualRepayment(loanId: string, borrowerWallet: Wallet): Promise<boolean> {
    const loan = this.activeLoans.get(loanId);
    const hook = this.activeHooks.get(loanId);
    
    if (!loan || !hook || loan.status !== 'active') {
      throw new Error('Loan not found or not active');
    }

    try {
      // Execute manual repayment
      const repaymentResult = await this.xrplClient.sendPayment(
        borrowerWallet,
        loan.lenderAddress,
        loan.totalRepaymentAmount.toString()
      );

      if (repaymentResult.result.meta.TransactionResult === 'tesSUCCESS') {
        // Update loan status
        loan.status = 'repaid';
        loan.repaidAt = Math.floor(Date.now() / 1000);
        
        // Deactivate hook
        hook.isActive = false;
        
        console.log(`Loan ${loanId} manually repaid successfully`);
        return true;
      } else {
        throw new Error('Manual repayment transaction failed');
      }

    } catch (error) {
      console.error(`Manual repayment failed for loan ${loanId}:`, error);
      return false;
    }
  }
}

// Factory function to create the loan factory
export function createLoanFactory(xrplClient: XRPLClient): AutoRepaymentLoanFactory {
  return new AutoRepaymentLoanFactory(xrplClient);
}
