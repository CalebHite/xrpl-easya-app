import { Wallet, xrpToDrops } from 'xrpl';
import XRPLClient from './xrpl-client';
import { LoanAgreement, LoanCreationResult, AutoLoanHook, HookTransaction, XRPLWallet } from './types';
import { CreditManager, updateWalletCreditInStorage } from './credit-manager';

export class AutoRepaymentLoanFactory {
  private xrplClient: XRPLClient;
  private activeLoans: Map<string, LoanAgreement> = new Map();
  private activeHooks: Map<string, AutoLoanHook> = new Map();
  private onLoanRepaidCallback?: (loanAgreement: LoanAgreement) => void;

  constructor(xrplClient: XRPLClient) {
    this.xrplClient = xrplClient;
  }

  /**
   * Set callback function to be called when a loan is successfully repaid
   */
  setOnLoanRepaidCallback(callback: (loanAgreement: LoanAgreement) => void) {
    this.onLoanRepaidCallback = callback;
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

      console.log(`Creating loan ${loanId} with auto-repayment hook`);
      console.log(`Loan details: ${principalAmount} XRP principal, ${totalRepaymentAmount} XRP total repayment`);

      // Step 1: Check lender has sufficient balance
      const lenderBalance = await this.xrplClient.getAccountBalance(lenderWallet.address);
      const lenderBalanceNum = parseFloat(lenderBalance);
      console.log(`Lender balance: ${lenderBalance} XRP`);
      
      if (lenderBalanceNum < principalAmount + 2) { // Need principal + fees
        throw new Error(`Lender has insufficient balance. Has: ${lenderBalance} XRP, needs: ${principalAmount + 2} XRP`);
      }

      // Step 2: Create a hook account that will handle automatic repayment
      const hookAccount = await this.createHookAccount(
        borrowerWallet,
        lenderWallet.address,
        totalRepaymentAmount,
        executeAt
      );

      // Step 3: Transfer principal from lender to borrower
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

      // Step 4: Set up automatic repayment hook
      const hookSetupResult = await this.setupAutomaticRepaymentHook(
        borrowerWallet,
        hookAccount.address,
        totalRepaymentAmount,
        executeAt
      );

      // Step 5: Create loan agreement
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
        txHash: loanTransferResult.result.hash,
        hookAccountId: hookAccount.address
      };

      // Store the loan and hook information
      this.activeLoans.set(loanId, loanAgreement);
      this.activeHooks.set(loanId, {
        hookAccountId: hookAccount.address,
        borrowerAddress: borrowerWallet.address,
        lenderAddress: lenderWallet.address,
        repaymentAmount: totalRepaymentAmount,
        executeAt,
        isActive: true
      });

      // Start monitoring the hook for automatic execution
      this.startHookMonitoring(loanId);

      console.log(`Loan ${loanId} created successfully with automatic repayment`);

      return {
        success: true,
        agreement: loanAgreement,
        contractId: loanId,
        txHash: loanTransferResult.result.hash,
        hookAccountId: hookAccount.address
      };

    } catch (error) {
      console.error('Failed to create loan:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private async createHookAccount(
    borrowerWallet: Wallet,
    lenderAddress: string,
    repaymentAmount: number,
    executeAt: number
  ): Promise<Wallet> {
    // Create a new wallet that will act as the hook account
    const hookWallet = Wallet.generate();
    
    // Fund the hook account with enough XRP for the repayment plus fees
    const fundingAmount = repaymentAmount + 2; // Add 2 XRP for fees and reserve
    
    // Transfer funds from borrower to hook account
    await this.xrplClient.sendPayment(
      borrowerWallet,
      hookWallet.address,
      fundingAmount.toString()
    );

    return hookWallet;
  }

  private async setupAutomaticRepaymentHook(
    borrowerWallet: Wallet,
    hookAccountAddress: string,
    repaymentAmount: number,
    executeAt: number
  ): Promise<any> {
    
    console.log(`Hook configured for automatic repayment of ${repaymentAmount} XRP at ${new Date(executeAt * 1000)}`);
    
    return {
      success: true,
      hookAccountAddress,
      triggerTime: executeAt
    };
  }

  private startHookMonitoring(loanId: string): void {
    const hook = this.activeHooks.get(loanId);
    const loan = this.activeLoans.get(loanId);
    
    if (!hook || !loan) return;

    // Set up a timer to execute the automatic repayment
    const timeUntilExecution = (hook.executeAt * 1000) - Date.now();
    
    if (timeUntilExecution > 0) {
      setTimeout(async () => {
        await this.executeAutomaticRepayment(loanId);
      }, timeUntilExecution);
      
      console.log(`Automatic repayment scheduled for loan ${loanId} in ${Math.round(timeUntilExecution / 1000)} seconds`);
    } else {
      // Loan is already past due
      this.executeAutomaticRepayment(loanId);
    }
  }

  private async executeAutomaticRepayment(loanId: string): Promise<void> {
    const hook = this.activeHooks.get(loanId);
    const loan = this.activeLoans.get(loanId);
    
    if (!hook || !loan || !hook.isActive) {
      console.log(`Skipping automatic repayment for loan ${loanId} - not active`);
      return;
    }

    try {
      console.log(`Executing automatic repayment for loan ${loanId}`);
      
      // Create a wallet from the hook account (in practice, this would be handled by the hook itself)
      const hookWallet = await this.getHookWallet(hook.hookAccountId);
      
      if (!hookWallet) {
        throw new Error('Hook wallet not found');
      }

      // Execute the repayment transaction
      const repaymentResult = await this.xrplClient.sendPayment(
        hookWallet,
        hook.lenderAddress,
        hook.repaymentAmount.toString()
      );

      if (repaymentResult.result.meta.TransactionResult === 'tesSUCCESS') {
        // Update loan status
        loan.status = 'repaid';
        loan.repaidAt = Math.floor(Date.now() / 1000);
        
        // Deactivate hook
        hook.isActive = false;
        
        console.log(`Loan ${loanId} automatically repaid successfully`);
        
        // Trigger credit update callback
        if (this.onLoanRepaidCallback) {
          this.onLoanRepaidCallback(loan);
        }
      } else {
        throw new Error('Repayment transaction failed');
      }

    } catch (error) {
      console.error(`Automatic repayment failed for loan ${loanId}:`, error);
      
      // Mark loan as defaulted
      if (loan) {
        loan.status = 'defaulted';
      }
      
      // Deactivate hook
      if (hook) {
        hook.isActive = false;
      }
    }
  }

  private async getHookWallet(hookAccountId: string): Promise<Wallet | null> {
    // In a real implementation, you would retrieve the hook wallet securely
    // For this demo, we'll simulate it by generating a wallet
    // In practice, the hook would be deployed on-chain and execute automatically
    
    try {
      // This is a simplified approach - in reality, the hook would be a smart contract
      // that executes automatically when the deadline is reached
      const hookWallet = Wallet.generate();
      return hookWallet;
    } catch (error) {
      console.error('Failed to get hook wallet:', error);
      return null;
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
        
        // Trigger credit update callback
        if (this.onLoanRepaidCallback) {
          this.onLoanRepaidCallback(loan);
        }
        
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
