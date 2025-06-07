import xrpl from 'xrpl';

export class XRPHandshakeDeployer {
  constructor() {
    this.client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/", {
        connectionTimeout: 20000,
        requestTimeout: 30000
    });
    this.contracts = new Map();
  }

  async connect() {
    await this.client.connect();
    console.log('Connected to XRP Ledger');
  }

  async disconnect() {
    await this.client.disconnect();
    console.log('Disconnected from XRP Ledger');
  }

  // Generate a new wallet for the contract
  async generateContractWallet() {
    const fundResult = await this.client.fundWallet();
    return fundResult.wallet;
  }

  // Create and deploy a new handshake agreement contract
  async deployHandshakeContract(
    senderWallet,
    senderAddress,
    recipientAddress,
    amountXRP,
    durationSeconds,
    agreementTerms = ""
  ) {
    try {
      // Generate a unique contract wallet
      const contractWallet = await this.generateContractWallet();
      const contractId = contractWallet.address;

      // Create the handshake agreement data
      const agreementData = {
        id: contractId,
        sender: senderAddress,
        recipient: recipientAddress,
        amount: amountXRP,
        createdAt: Date.now(),
        executeAt: Date.now() + (durationSeconds * 1000),
        terms: agreementTerms,
        status: 'active',
        contractAddress: contractWallet.address,
        contractSeed: contractWallet.seed
      };

      // Store agreement terms in a memo transaction
      const memoTx = {
        TransactionType: 'Payment',
        Account: senderWallet.address,
        Destination: contractWallet.address,
        Amount: '1000000', // 1 XRP to activate the contract account
        Memos: [{
          Memo: {
            MemoType: Buffer.from('handshake-agreement', 'utf8').toString('hex').toUpperCase(),
            MemoData: Buffer.from(JSON.stringify({
              sender: senderAddress,
              recipient: recipientAddress,
              amount: amountXRP,
              duration: durationSeconds,
              terms: agreementTerms,
              executeAt: agreementData.executeAt
            }), 'utf8').toString('hex').toUpperCase()
          }
        }]
      };

      // Submit the memo transaction
      const prepared = await this.client.autofill(memoTx);
      const signed = senderWallet.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      if (result.result.meta.TransactionResult === 'tesSUCCESS') {
        // Store contract locally
        this.contracts.set(contractId, agreementData);

        console.log(`Handshake contract deployed successfully!`);
        console.log(`Contract ID: ${contractId}`);
        console.log(`Sender: ${senderAddress}`);
        console.log(`Recipient: ${recipientAddress}`);
        console.log(`Amount: ${amountXRP} XRP`);
        console.log(`Execute in: ${durationSeconds} seconds`);

        // Fund the contract with the agreed amount
        await this.fundContract(senderWallet, contractWallet.address, amountXRP);

        // Set up automatic execution
        this.scheduleExecution(contractId, senderWallet, contractWallet);

        return {
          success: true,
          contractId,
          contractAddress: contractWallet.address,
          transactionHash: result.result.hash,
          agreement: agreementData
        };
      } else {
        throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
      }

    } catch (error) {
      console.error('Error deploying handshake contract:', error);
      return { success: false, error: error.message };
    }
  }

  // Fund the contract with the agreed XRP amount
  async fundContract(senderWallet, contractAddress, amountXRP) {
    try {
      const fundTx = {
        TransactionType: 'Payment',
        Account: senderWallet.address,
        Destination: contractAddress,
        Amount: (parseFloat(amountXRP) * 1000000).toString() // Convert XRP to drops
      };

      const prepared = await this.client.autofill(fundTx);
      const signed = senderWallet.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      console.log(`Contract funded with ${amountXRP} XRP`);
      return result.result.hash;
    } catch (error) {
      console.error('Error funding contract:', error);
      throw error;
    }
  }

  // Schedule automatic execution of the contract
  scheduleExecution(contractId, senderWallet, contractWallet) {
    const agreement = this.contracts.get(contractId);
    if (!agreement) return;

    const timeUntilExecution = agreement.executeAt - Date.now();

    setTimeout(async () => {
      await this.executeContract(contractId, senderWallet, contractWallet);
    }, Math.max(0, timeUntilExecution));

    console.log(`Contract execution scheduled for ${new Date(agreement.executeAt)}`);
  }

  // Execute the contract (send XRP to recipient)
  async executeContract(contractId, senderWallet, contractWallet) {
    try {
      // Ensure client is connected
      if (!this.client.isConnected()) {
        await this.connect();
      }

      const agreement = this.contracts.get(contractId);
      if (!agreement || agreement.status !== 'active') {
        console.log(`Contract ${contractId} is not active or doesn't exist`);
        return;
      }

      // Get contract balance
      const accountInfo = await this.client.request({
        command: 'account_info',
        account: contractWallet.address
      });

      const balance = parseInt(accountInfo.result.account_data.Balance);
      const availableBalance = balance - 10000000; // Reserve 10 XRP for account reserve

      if (availableBalance <= 0) {
        console.log(`Insufficient balance in contract ${contractId}`);
        return;
      }

      // Send XRP to recipient
      const executionTx = {
        TransactionType: 'Payment',
        Account: contractWallet.address,
        Destination: agreement.recipient,
        Amount: availableBalance.toString(),
        Memos: [{
          Memo: {
            MemoType: Buffer.from('handshake-executed', 'utf8').toString('hex').toUpperCase(),
            MemoData: Buffer.from(`Contract ${contractId} executed`, 'utf8').toString('hex').toUpperCase()
          }
        }]
      };

      const prepared = await this.client.autofill(executionTx);
      const signed = contractWallet.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      if (result.result.meta.TransactionResult === 'tesSUCCESS') {
        agreement.status = 'executed';
        agreement.executedAt = Date.now();
        agreement.executionTxHash = result.result.hash;

        console.log(`Contract ${contractId} executed successfully!`);
        console.log(`${availableBalance / 1000000} XRP sent to ${agreement.recipient}`);
        console.log(`Transaction hash: ${result.result.hash}`);

        return {
          success: true,
          contractId,
          executionTxHash: result.result.hash,
          amountSent: availableBalance / 1000000
        };
      } else {
        throw new Error(`Execution failed: ${result.result.meta.TransactionResult}`);
      }

    } catch (error) {
      console.error(`Error executing contract ${contractId}:`, error);
      return { success: false, error: error.message };
    } finally {
      // Disconnect after execution to free resources
      if (this.client.isConnected()) {
        await this.disconnect();
      }
    }
  }

  // Get contract details
  getContract(contractId) {
    return this.contracts.get(contractId);
  }

  // List all contracts
  listContracts() {
    return Array.from(this.contracts.values());
  }

  // Cancel a contract (only before execution)
  async cancelContract(contractId, senderWallet) {
    try {
      // Ensure client is connected
      if (!this.client.isConnected()) {
        await this.connect();
      }

      const agreement = this.contracts.get(contractId);
      if (!agreement || agreement.status !== 'active') {
        throw new Error('Contract not found or already executed');
      }

      if (agreement.sender !== senderWallet.address) {
        throw new Error('Only the sender can cancel the contract');
      }

      // Return funds to sender
      const contractWallet = xrpl.Wallet.fromSeed(agreement.contractSeed);
      const accountInfo = await this.client.request({
        command: 'account_info',
        account: agreement.contractAddress
      });

      const balance = parseInt(accountInfo.result.account_data.Balance);
      const refundAmount = balance - 10000000; // Keep reserve

      if (refundAmount > 0) {
        const refundTx = {
          TransactionType: 'Payment',
          Account: agreement.contractAddress,
          Destination: agreement.sender,
          Amount: refundAmount.toString(),
          Memos: [{
            Memo: {
              MemoType: Buffer.from('contract-cancelled', 'utf8').toString('hex').toUpperCase(),
              MemoData: Buffer.from(`Contract ${contractId} cancelled`, 'utf8').toString('hex').toUpperCase()
            }
          }]
        };

        const prepared = await this.client.autofill(refundTx);
        const signed = contractWallet.sign(prepared);
        const result = await this.client.submitAndWait(signed.tx_blob);

        if (result.result.meta.TransactionResult === 'tesSUCCESS') {
          agreement.status = 'cancelled';
          agreement.cancelledAt = Date.now();

          console.log(`Contract ${contractId} cancelled successfully`);
          return { success: true, refundTxHash: result.result.hash };
        }
      }

    } catch (error) {
      console.error(`Error cancelling contract ${contractId}:`, error);
      return { success: false, error: error.message };
    } finally {
      // Disconnect after cancellation to free resources
      if (this.client.isConnected()) {
        await this.disconnect();
      }
    }
  }
}

export function createHandshakeFactory() {
  const deployer = new XRPHandshakeDeployer();

  return {
    async createHandshake(senderWallet, recipientAddress, amountXRP, durationSeconds, terms) {
      await deployer.connect();
      const result = await deployer.deployHandshakeContract(
        senderWallet,
        senderWallet.address,
        recipientAddress,
        amountXRP,
        durationSeconds,
        terms
      );
      await deployer.disconnect();
      return result;
    }
  };
}