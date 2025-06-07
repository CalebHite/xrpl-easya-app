import { Client, Wallet, TransactionMetadata } from 'xrpl';
import { XRPLWallet, XRPLClientInterface } from './types';

export default class XRPLClient implements XRPLClientInterface {
    client: Client;
    wallets: XRPLWallet[];

    constructor() {
        this.client = new Client("wss://s.altnet.rippletest.net:51233/", {
            connectionTimeout: 20000,
            requestTimeout: 30000
        });
        this.wallets = [];
        this.connect();
    }

    async connect(): Promise<void> {
        try {
            await this.client.connect();
            console.log('Connected to XRPL');
        } catch (error) {
            if (error instanceof Error) {
                console.error('Failed to connect to XRPL:', error.message);
            }
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        await this.client.disconnect();
        console.log('Disconnected from XRPL');
    }

    async createAccount(userName: string): Promise<XRPLWallet> {
        try {
            const wallet = await this.client.fundWallet();

            const walletObject: XRPLWallet = {
                address: wallet.wallet.classicAddress,
                publicKey: wallet.wallet.publicKey,
                privateKey: wallet.wallet.privateKey,
                seed: wallet.wallet.seed,
                balance: wallet.balance,
                userName: userName,
                network: 'xrp-testnet',
                needsFunding: true
            };

            this.wallets.push(walletObject);
            console.log(`Generated new account: ${walletObject.address}`);

            return walletObject;
        } catch (error) {
            throw error;
        }
    }

    async getAllAccounts(): Promise<XRPLWallet[]> {
        return this.wallets;
    }

    async removeAccount(address: string): Promise<void> {
        this.wallets = this.wallets.filter(wallet => wallet.address !== address);
    }

    async checkAndUpdateFunding(address: string): Promise<{
        address: string;
        balance: string;
        isFunded: boolean;
    }> {
        try {
            const balance = await this.getBalance(address);
            const walletIndex = this.wallets.findIndex(wallet => wallet.address === address);

            if (walletIndex !== -1) {
                this.wallets[walletIndex].balance = Client.dropsToXrp(balance);
                this.wallets[walletIndex].needsFunding = parseInt(balance) === 0;

                if (parseInt(balance) > 0) {
                    console.log(`Account ${address} is funded with ${Client.dropsToXrp(balance)} XRP`);
                }
            }

            return {
                address,
                balance: Client.dropsToXrp(balance),
                isFunded: parseInt(balance) > 0
            };
        } catch (error) {
            console.error(`Failed to check funding for ${address}:`, error);
            return {
                address,
                balance: '0',
                isFunded: false
            };
        }
    }

    async getAccountInfo(address: string): Promise<any> {
        try {
            const accountInfo = await this.client.request({
                command: "account_info",
                account: address,
            });
            return accountInfo;
        } catch (error) {
            console.error(`Failed to get account info for ${address}:`, error);
            throw error;
        }
    }

    async getBalance(address: string): Promise<string> {
        try {
            const accountInfo = await this.getAccountInfo(address);
            return accountInfo.result.account_data.Balance;
        } catch (error) {
            console.error(`Failed to get balance for ${address}:`, error);
            throw error;
        }
    }

    async getAccountHooks(address: string): Promise<any[]> {
        try {
            const response = await this.client.request({
                command: "account_info",
                account: address,
                ledger_index: "validated"
            });

            return response.result.account_data.Hooks || [];
        } catch (error) {
            console.error(`Failed to get hooks for ${address}:`, error);
            throw error;
        }
    }

    async submitTransaction(transaction: any, wallet: Wallet): Promise<{
        result: {
            meta: TransactionMetadata;
            hash: string;
        };
    }> {
        try {
            if (!this.client.isConnected()) {
                await this.client.connect();
            }

            const prepared = await this.client.autofill(transaction);
            const signed = wallet.sign(prepared);
            const result = await this.client.submitAndWait(signed.tx_blob);

            return result;
        } catch (error) {
            console.error('Transaction failed:', error);
            throw error;
        }
    }
}