import { Client, Wallet, TransactionMetadata } from 'xrpl';

export interface XRPLWallet {
    address: string;
    publicKey: string;
    privateKey: string;
    seed: string;
    balance: string;
    userName: string;
    network: string;
    needsFunding: boolean;
}

export interface LoanAgreement {
    id: string;
    borrower: string;
    lender: string;
    principalAmount: number;
    interestRate: number;
    durationSeconds: number;
    createdAt: number;
    executeAt: number;
    terms: string;
    status: 'active' | 'repaid' | 'defaulted' | 'cancelled';
    contractAddress: string;
    contractSeed: string;
    repaidAt?: number;
    repaymentTxHash?: string;
    cancelledAt?: number;
    totalRepaymentAmount: number;
}

export interface TransactionResult {
    success: boolean;
    error?: string;
    contractId?: string;
    contractAddress?: string;
    transactionHash?: string;
    agreement?: LoanAgreement;
    repaymentTxHash?: string;
    amountRepaid?: number;
    refundTxHash?: string;
}

export interface XRPLClientInterface {
    client: Client;
    wallets: XRPLWallet[];
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    createAccount(userName: string): Promise<XRPLWallet>;
    getAllAccounts(): Promise<XRPLWallet[]>;
    removeAccount(address: string): Promise<void>;
    checkAndUpdateFunding(address: string): Promise<{
        address: string;
        balance: string;
        isFunded: boolean;
    }>;
    getAccountInfo(address: string): Promise<any>;
    getBalance(address: string): Promise<string>;
    getAccountHooks(address: string): Promise<any[]>;
    submitTransaction(transaction: any, wallet: Wallet): Promise<{
        result: {
            meta: TransactionMetadata;
            hash: string;
        };
    }>;
}

export interface XRPLoanDeployerInterface {
    client: Client;
    contracts: Map<string, LoanAgreement>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    generateContractWallet(): Promise<Wallet>;
    deployLoanContract(
        borrowerWallet: Wallet,
        borrowerAddress: string,
        lenderAddress: string,
        principalAmount: number,
        interestRate: number,
        durationSeconds: number,
        loanTerms?: string
    ): Promise<TransactionResult>;
    fundContract(lenderWallet: Wallet, contractAddress: string, amountXRP: number): Promise<string>;
    scheduleRepayment(contractId: string, borrowerWallet: Wallet, contractWallet: Wallet): void;
    executeRepayment(contractId: string, borrowerWallet: Wallet, contractWallet: Wallet): Promise<TransactionResult>;
    getContract(contractId: string): LoanAgreement | undefined;
    listContracts(): LoanAgreement[];
    cancelContract(contractId: string, borrowerWallet: Wallet): Promise<TransactionResult>;
} 