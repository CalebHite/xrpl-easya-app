import { Client, Wallet } from 'xrpl';
import { LoanAgreement, TransactionResult, XRPLoanDeployerInterface } from './types';

export class XRPLoanDeployer implements XRPLoanDeployerInterface {
    client: Client;
    contracts: Map<string, LoanAgreement>;

    constructor() {
        this.client = new Client("wss://s.altnet.rippletest.net:51233/", {
            connectionTimeout: 20000,
            requestTimeout: 30000
        });
        this.contracts = new Map();
    }

    async connect(): Promise<void> {
        await this.client.connect();
        console.log('Connected to XRP Ledger');
    }

    async disconnect(): Promise<void> {
        await this.client.disconnect();
        console.log('Disconnected from XRP Ledger');
    }

    async generateContractWallet(): Promise<Wallet> {
        const fundResult = await this.client.fundWallet();
        return fundResult.wallet;
    }

    async deployLoanContract(
        borrowerWallet: Wallet,
        borrowerAddress: string,
        lenderAddress: string,
        principalAmount: number,
        interestRate: number,
        durationSeconds: number,
        loanTerms: string = ""
    ): Promise<TransactionResult> {
        try {
            const contractWallet = await this.generateContractWallet();
            const contractId = contractWallet.address;

            // Calculate total repayment amount with interest
            const interestAmount = principalAmount * (interestRate / 100);
            const totalRepaymentAmount = principalAmount + interestAmount;

            const loanData: LoanAgreement = {
                id: contractId,
                borrower: borrowerAddress,
                lender: lenderAddress,
                principalAmount,
                interestRate,
                durationSeconds,
                createdAt: Date.now(),
                executeAt: Date.now() + (durationSeconds * 1000),
                terms: loanTerms,
                status: 'active',
                contractAddress: contractWallet.address,
                contractSeed: contractWallet.seed,
                totalRepaymentAmount
            };

            // Store loan terms in a memo transaction
            const memoTx = {
                TransactionType: 'Payment',
                Account: lenderAddress,
                Destination: contractWallet.address,
                Amount: '1000000', // 1 XRP to activate the contract account
                Memos: [{
                    Memo: {
                        MemoType: Buffer.from('loan-agreement', 'utf8').toString('hex').toUpperCase(),
                        MemoData: Buffer.from(JSON.stringify({
                            borrower: borrowerAddress,
                            lender: lenderAddress,
                            principalAmount,
                            interestRate,
                            duration: durationSeconds,
                            terms: loanTerms,
                            executeAt: loanData.executeAt,
                            totalRepaymentAmount
                        }), 'utf8').toString('hex').toUpperCase()
                    }
                }]
            };

            const prepared = await this.client.autofill(memoTx);
            const signed = borrowerWallet.sign(prepared);
            const result = await this.client.submitAndWait(signed.tx_blob);

            if (result.result.meta.TransactionResult === 'tesSUCCESS') {
                this.contracts.set(contractId, loanData);

                console.log(`Loan contract deployed successfully!`);
                console.log(`Contract ID: ${contractId}`);
                console.log(`Borrower: ${borrowerAddress}`);
                console.log(`Lender: ${lenderAddress}`);
                console.log(`Principal Amount: ${principalAmount} XRP`);
                console.log(`Interest Rate: ${interestRate}%`);
                console.log(`Total Repayment: ${totalRepaymentAmount} XRP`);
                console.log(`Repayment in: ${durationSeconds} seconds`);

                // Fund the contract with the loan amount
                await this.fundContract(borrowerWallet, contractWallet.address, principalAmount);

                // Set up automatic repayment
                this.scheduleRepayment(contractId, borrowerWallet, contractWallet);

                return {
                    success: true,
                    contractId,
                    contractAddress: contractWallet.address,
                    transactionHash: result.result.hash,
                    agreement: loanData
                };
            } else {
                throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
            }

        } catch (error) {
            console.error('Error deploying loan contract:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        }
    }

    async fundContract(lenderWallet: Wallet, contractAddress: string, amountXRP: number): Promise<string> {
        try {
            const fundTx = {
                TransactionType: 'Payment',
                Account: lenderWallet.address,
                Destination: contractAddress,
                Amount: (amountXRP * 1000000).toString()
            };

            const prepared = await this.client.autofill(fundTx);
            const signed = lenderWallet.sign(prepared);
            const result = await this.client.submitAndWait(signed.tx_blob);

            console.log(`Contract funded with ${amountXRP} XRP`);
            return result.result.hash;
        } catch (error) {
            console.error('Error funding contract:', error);
            throw error;
        }
    }

    scheduleRepayment(contractId: string, borrowerWallet: Wallet, contractWallet: Wallet): void {
        const loan = this.contracts.get(contractId);
        if (!loan) return;

        const timeUntilRepayment = loan.executeAt - Date.now();

        setTimeout(async () => {
            await this.executeRepayment(contractId, borrowerWallet, contractWallet);
        }, Math.max(0, timeUntilRepayment));

        console.log(`Loan repayment scheduled for ${new Date(loan.executeAt)}`);
    }

    async executeRepayment(contractId: string, borrowerWallet: Wallet, contractWallet: Wallet): Promise<TransactionResult> {
        try {
            if (!this.client.isConnected()) {
                await this.connect();
            }

            const loan = this.contracts.get(contractId);
            if (!loan || loan.status !== 'active') {
                console.log(`Loan ${contractId} is not active or doesn't exist`);
                return { success: false, error: 'Loan not active or does not exist' };
            }

            // Get contract balance
            const accountInfo = await this.client.request({
                command: 'account_info',
                account: contractWallet.address
            });

            const balance = parseInt(accountInfo.result.account_data.Balance);
            const availableBalance = balance - 10000000; // Reserve 10 XRP

            if (availableBalance <= 0) {
                console.log(`Insufficient balance in loan ${contractId}`);
                loan.status = 'defaulted';
                return { success: false, error: 'Insufficient balance for repayment' };
            }

            // Send repayment to lender
            const repaymentTx = {
                TransactionType: 'Payment',
                Account: contractWallet.address,
                Destination: loan.lender,
                Amount: availableBalance.toString(),
                Memos: [{
                    Memo: {
                        MemoType: Buffer.from('loan-repaid', 'utf8').toString('hex').toUpperCase(),
                        MemoData: Buffer.from(`Loan ${contractId} repaid`, 'utf8').toString('hex').toUpperCase()
                    }
                }]
            };

            const prepared = await this.client.autofill(repaymentTx);
            const signed = contractWallet.sign(prepared);
            const result = await this.client.submitAndWait(signed.tx_blob);

            if (result.result.meta.TransactionResult === 'tesSUCCESS') {
                loan.status = 'repaid';
                loan.repaidAt = Date.now();
                loan.repaymentTxHash = result.result.hash;

                console.log(`Loan ${contractId} repaid successfully!`);
                console.log(`${availableBalance / 1000000} XRP sent to ${loan.lender}`);
                console.log(`Transaction hash: ${result.result.hash}`);

                return {
                    success: true,
                    contractId,
                    repaymentTxHash: result.result.hash,
                    amountRepaid: availableBalance / 1000000
                };
            } else {
                loan.status = 'defaulted';
                throw new Error(`Repayment failed: ${result.result.meta.TransactionResult}`);
            }

        } catch (error) {
            console.error(`Error repaying loan ${contractId}:`, error);
            const loan = this.contracts.get(contractId);
            if (loan) {
                loan.status = 'defaulted';
            }
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        } finally {
            if (this.client.isConnected()) {
                await this.disconnect();
            }
        }
    }

    getContract(contractId: string): LoanAgreement | undefined {
        return this.contracts.get(contractId);
    }

    listContracts(): LoanAgreement[] {
        return Array.from(this.contracts.values());
    }

    async cancelContract(contractId: string, borrowerWallet: Wallet): Promise<TransactionResult> {
        try {
            if (!this.client.isConnected()) {
                await this.connect();
            }

            const loan = this.contracts.get(contractId);
            if (!loan || loan.status !== 'active') {
                throw new Error('Loan not found or already repaid');
            }

            if (loan.borrower !== borrowerWallet.address) {
                throw new Error('Only the borrower can cancel the loan');
            }

            // Return funds to lender
            const contractWallet = Wallet.fromSeed(loan.contractSeed);
            const accountInfo = await this.client.request({
                command: 'account_info',
                account: loan.contractAddress
            });

            const balance = parseInt(accountInfo.result.account_data.Balance);
            const refundAmount = balance - 10000000; // Keep reserve

            if (refundAmount > 0) {
                const refundTx = {
                    TransactionType: 'Payment',
                    Account: loan.contractAddress,
                    Destination: loan.lender,
                    Amount: refundAmount.toString(),
                    Memos: [{
                        Memo: {
                            MemoType: Buffer.from('loan-cancelled', 'utf8').toString('hex').toUpperCase(),
                            MemoData: Buffer.from(`Loan ${contractId} cancelled`, 'utf8').toString('hex').toUpperCase()
                        }
                    }]
                };

                const prepared = await this.client.autofill(refundTx);
                const signed = contractWallet.sign(prepared);
                const result = await this.client.submitAndWait(signed.tx_blob);

                if (result.result.meta.TransactionResult === 'tesSUCCESS') {
                    loan.status = 'cancelled';
                    loan.cancelledAt = Date.now();

                    console.log(`Loan ${contractId} cancelled successfully`);
                    return { success: true, refundTxHash: result.result.hash };
                }
            }

            return { success: false, error: 'No funds to refund' };

        } catch (error) {
            console.error(`Error cancelling loan ${contractId}:`, error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error occurred' 
            };
        } finally {
            if (this.client.isConnected()) {
                await this.disconnect();
            }
        }
    }
}

export function createLoanFactory() {
    const deployer = new XRPLoanDeployer();

    return {
        async createLoan(
            borrowerWallet: Wallet,
            lenderAddress: string,
            principalAmount: number,
            interestRate: number,
            durationSeconds: number,
            terms?: string
        ): Promise<TransactionResult> {
            await deployer.connect();
            const result = await deployer.deployLoanContract(
                borrowerWallet,
                borrowerWallet.address,
                lenderAddress,
                principalAmount,
                interestRate,
                durationSeconds,
                terms
            );
            await deployer.disconnect();
            return result;
        }
    };
}