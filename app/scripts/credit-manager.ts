import { XRPLWallet, CreditRequirement, CreditUpdate } from './types';

export class CreditManager {
  // Credit tiers with loan limits
  private static readonly CREDIT_TIERS: CreditRequirement[] = [
    { minCreditScore: 0, maxLoanAmount: 10, description: 'Starter' },
    { minCreditScore: 150, maxLoanAmount: 25, description: 'Bronze' },
    { minCreditScore: 300, maxLoanAmount: 50, description: 'Silver' },
    { minCreditScore: 500, maxLoanAmount: 100, description: 'Gold' },
    { minCreditScore: 750, maxLoanAmount: 200, description: 'Platinum' },
    { minCreditScore: 1000, maxLoanAmount: 500, description: 'Diamond' },
  ];

  // Points awarded for successful loan repayment
  private static readonly CREDIT_POINTS_PER_XRP = 2; // 2 points per XRP repaid
  private static readonly MIN_CREDIT_GAIN = 10; // Minimum credit gain per successful loan
  private static readonly MAX_CREDIT_GAIN = 100; // Maximum credit gain per successful loan

  /**
   * Initialize credit score for new wallets
   */
  static initializeCreditScore(wallet: XRPLWallet): XRPLWallet {
    if (wallet.creditScore === undefined) {
      wallet.creditScore = 100; // Starting credit score (doubled)
    }
    return wallet;
  }

  /**
   * Get credit tier for a given credit score
   */
  static getCreditTier(creditScore: number): CreditRequirement {
    // Find the highest tier the user qualifies for
    for (let i = this.CREDIT_TIERS.length - 1; i >= 0; i--) {
      if (creditScore >= this.CREDIT_TIERS[i].minCreditScore) {
        return this.CREDIT_TIERS[i];
      }
    }
    return this.CREDIT_TIERS[0]; // Default to starter tier
  }

  /**
   * Check if a wallet can take a loan of a given amount
   */
  static canTakeLoan(wallet: XRPLWallet, loanAmount: number): { eligible: boolean; tier: CreditRequirement; message: string } {
    const creditScore = wallet.creditScore || 100;
    const tier = this.getCreditTier(creditScore);
    
    if (loanAmount <= tier.maxLoanAmount) {
      return {
        eligible: true,
        tier,
        message: `Eligible for ${loanAmount} XRP loan with ${tier.description} credit tier`
      };
    } else {
      const nextTier = this.getNextTier(creditScore);
      return {
        eligible: false,
        tier,
        message: nextTier 
          ? `Loan amount exceeds ${tier.description} tier limit (${tier.maxLoanAmount} XRP). Need ${nextTier.minCreditScore} credit score for ${nextTier.description} tier (${nextTier.maxLoanAmount} XRP limit).`
          : `Loan amount exceeds maximum tier limit (${tier.maxLoanAmount} XRP).`
      };
    }
  }

  /**
   * Calculate credit score increase for successful loan repayment
   */
  static calculateCreditIncrease(loanAmount: number): number {
    const basePoints = Math.floor(loanAmount * this.CREDIT_POINTS_PER_XRP);
    console.log('basePoints', basePoints);
    console.log('Returning', Math.min(Math.max(basePoints, this.MIN_CREDIT_GAIN), this.MAX_CREDIT_GAIN));
    return Math.min(Math.max(basePoints, this.MIN_CREDIT_GAIN), this.MAX_CREDIT_GAIN);
  }

  /**
   * Update wallet credit score after successful repayment
   */
  static updateCreditScore(wallet: XRPLWallet, loanAmount: number): { 
    oldScore: number;
    newScore: number;
    increase: number;
    newTier: CreditRequirement;
  } {
    const oldScore = wallet.creditScore || 100;
    const increase = 1; // Always increase by 1 per payment
    const newScore = oldScore + increase;
    wallet.creditScore = newScore;
    return {
      oldScore,
      newScore,
      increase,
      newTier: this.getCreditTier(newScore)
    };
  }

  /**
   * Get next available credit tier
   */
  private static getNextTier(currentScore: number): CreditRequirement | null {
    for (const tier of this.CREDIT_TIERS) {
      if (tier.minCreditScore > currentScore) {
        return tier;
      }
    }
    return null; // Already at highest tier
  }

  /**
   * Get all available credit tiers for display
   */
  static getAllTiers(): CreditRequirement[] {
    return [...this.CREDIT_TIERS];
  }

  /**
   * Format credit score display
   */
  static formatCreditDisplay(creditScore: number): string {
    const tier = this.getCreditTier(creditScore);
    return `${creditScore} (${tier.description})`;
  }

  /**
   * Get progress to next tier
   */
  static getProgressToNextTier(creditScore: number): { 
    current: CreditRequirement;
    next: CreditRequirement | null;
    progress: number;
    pointsNeeded: number;
  } {
    const current = this.getCreditTier(creditScore);
    const next = this.getNextTier(creditScore);
    
    if (!next) {
      return {
        current,
        next,
        progress: 50,
        pointsNeeded: 0
      };
    }
    
    const pointsNeeded = next.minCreditScore - creditScore;
    const totalPointsNeeded = next.minCreditScore - current.minCreditScore;
    const progress = Math.max(0, Math.min(50, ((creditScore - current.minCreditScore) / totalPointsNeeded) * 50));
    
    return {
      current,
      next,
      progress,
      pointsNeeded
    };
  }

  /**
   * Decrease wallet credit score after loan default
   */
  static decreaseCreditScoreOnDefault(wallet: XRPLWallet): {
    oldScore: number;
    newScore: number;
    decrease: number;
    newTier: CreditRequirement;
  } {
    const oldScore = wallet.creditScore || 100;
    const decrease = 50; // Fixed penalty for default (doubled)
    const newScore = Math.max(0, oldScore - decrease);
    wallet.creditScore = newScore;
    return {
      oldScore,
      newScore,
      decrease,
      newTier: this.getCreditTier(newScore)
    };
  }
}

/**
 * Utility functions for credit management
 */

/**
 * Initialize credit score for existing wallets that don't have it
 */
export function initializeWalletCredits(): void {
  if (typeof window === 'undefined') return;
  
  const walletsData = localStorage.getItem('xrpl_wallets');
  if (!walletsData) return;
  
  try {
    const wallets: XRPLWallet[] = JSON.parse(walletsData);
    let updated = false;
    
    wallets.forEach(wallet => {
      if (wallet.creditScore === undefined) {
        wallet.creditScore = 100;
        updated = true;
      }
    });
    
    if (updated) {
      localStorage.setItem('xrpl_wallets', JSON.stringify(wallets));
    }
  } catch (error) {
    console.error('Failed to initialize wallet credits:', error);
  }
}

/**
 * Update wallet credit score in localStorage
 */
export function updateWalletCreditInStorage(address: string, newCreditScore: number): void {
  if (typeof window === 'undefined') return;
  
  const walletsData = localStorage.getItem('xrpl_wallets');
  if (!walletsData) return;
  
  try {
    const wallets: XRPLWallet[] = JSON.parse(walletsData);
    const walletIndex = wallets.findIndex(w => w.address === address);
    
    if (walletIndex !== -1) {
      wallets[walletIndex].creditScore = newCreditScore;
      localStorage.setItem('xrpl_wallets', JSON.stringify(wallets));
    }
  } catch (error) {
    console.error('Failed to update wallet credit in storage:', error);
  }
} 