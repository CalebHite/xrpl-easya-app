import { Client, Wallet, dropsToXrp, xrpToDrops } from 'xrpl';
import { XRPLWallet, FundingStatus } from './types';

export default class XRPLClient {
  private client: Client;
  private isConnected: boolean = false;

  constructor() {
    // Using testnet for development
    this.client = new Client('wss://s.altnet.rippletest.net:51233');
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
      this.isConnected = true;
      console.log('Connected to XRPL Testnet');
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      console.log('Disconnected from XRPL');
    }
  }

  async createAccount(userName: string): Promise<XRPLWallet> {
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    const wallet = Wallet.generate();
    const account: XRPLWallet = {
      address: wallet.address,
      seed: wallet.seed!,
      userName: userName
    };

    console.log(`Created account for ${userName}: ${account.address}`);
    
    // Fund the account using the testnet faucet with retry logic
    await this.ensureAccountFunding(wallet, 1000); // Target 1000 XRP funding

    return account;
  }

  private async ensureAccountFunding(wallet: Wallet, targetAmount: number = 1000): Promise<void> {
    const maxAttempts = 5;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Funding attempt ${attempts}/${maxAttempts} for ${wallet.address}`);
      
      try {
        // Try to fund using the testnet faucet
        await this.client.fundWallet(wallet);
        
        // Wait a moment for the transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if funding was successful
        const fundingStatus = await this.checkAndUpdateFunding(wallet.address);
        const balance = parseFloat(fundingStatus.balance);
        
        console.log(`Balance after funding attempt ${attempts}: ${balance} XRP`);
        
        if (balance >= 10) { // Consider successful if >= 10 XRP
          console.log(`Account ${wallet.address} successfully funded with ${balance} XRP`);
          return;
        }
        
        if (attempts < maxAttempts) {
          console.log(`Insufficient funding (${balance} XRP), retrying...`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait before retry
        }
        
      } catch (error) {
        console.log(`Funding attempt ${attempts} failed:`, error);
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait before retry
        }
      }
    }
    
    // Final check after all attempts
    const finalStatus = await this.checkAndUpdateFunding(wallet.address);
    const finalBalance = parseFloat(finalStatus.balance);
    
    if (finalBalance < 5) {
      console.warn(`Warning: Account ${wallet.address} may be underfunded (${finalBalance} XRP)`);
    }
  }

  async checkAndUpdateFunding(address: string): Promise<FundingStatus> {
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    try {
      const response = await this.client.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated'
      });

      const balance = dropsToXrp(response.result.account_data.Balance);
      const isFunded = parseFloat(balance) >= 10; // Consider funded if >= 10 XRP

      return {
        balance: balance,
        isFunded: isFunded
      };
    } catch (error: any) {
      if (error?.data?.error === 'actNotFound') {
        return {
          balance: '0',
          isFunded: false
        };
      }
      throw error;
    }
  }

  async getAccountBalance(address: string): Promise<string> {
    const fundingStatus = await this.checkAndUpdateFunding(address);
    return fundingStatus.balance;
  }

  async submitTransaction(transaction: any): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    const prepared = await this.client.autofill(transaction);
    const signed = Wallet.fromSeed(transaction.wallet.seed).sign(prepared);
    const result = await this.client.submitAndWait(signed.tx_blob);
    
    return result;
  }

  async sendPayment(fromWallet: Wallet, toAddress: string, amount: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    const payment = {
      TransactionType: 'Payment' as const,
      Account: fromWallet.address,
      Destination: toAddress,
      Amount: xrpToDrops(amount)
    };

    const prepared = await this.client.autofill(payment);
    const signed = fromWallet.sign(prepared);
    const result = await this.client.submitAndWait(signed.tx_blob);
    
    return result;
  }

  async getLedgerIndex(): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    const response = await this.client.request({
      command: 'ledger',
      ledger_index: 'validated'
    });

    return response.result.ledger_index;
  }

  getClient(): Client {
    return this.client;
  }
} 