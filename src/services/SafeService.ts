import Safe, {
    type SafeAccountConfig,
    type PredictedSafeProps,
    buildSignatureBytes,
} from '@safe-global/protocol-kit';
import {
    MetaTransactionData,
    OperationType,
    type SafeTransaction,
    type SafeSignature,
    type SafeMultisigTransactionResponse,
} from '@safe-global/types-kit';
import { type Address, type Hex, encodeFunctionData, parseUnits } from 'viem';
import { ERC20_ABI } from '../abis.js';

/**
 * SafeService wraps the Safe Protocol Kit for deployment and transaction building
 */
export class SafeService {
    private protocolKit: Safe | null = null;
    private signerPrivateKey: Hex;

    constructor(signerPrivateKey: Hex) {
        this.signerPrivateKey = signerPrivateKey;
    }

    /**
     * Get the internal Protocol Kit instance
     */
    getProtocolKit(): Safe | null {
        return this.protocolKit;
    }

    /**
     * Initialize the Protocol Kit with a predicted (not yet deployed) Safe
     */
    async initForDeployment(owners: Address[], threshold: number, rpcUrl: string): Promise<Address> {
        const safeAccountConfig: SafeAccountConfig = {
            owners,
            threshold,
        };

        const predictedSafe: PredictedSafeProps = {
            safeAccountConfig,
        };

        const SafeInit = (Safe as any).default?.init || Safe.init;
        this.protocolKit = await SafeInit({
            provider: rpcUrl,
            signer: this.signerPrivateKey,
            predictedSafe,
        });

        return await this.protocolKit!.getAddress() as Address;
    }

    /**
     * Initialize the Protocol Kit with an existing Safe
     */
    async initForExistingSafe(safeAddress: Address, rpcUrl: string): Promise<void> {
        const SafeInit = (Safe as any).default?.init || Safe.init;
        this.protocolKit = await SafeInit({
            provider: rpcUrl,
            signer: this.signerPrivateKey,
            safeAddress,
        });
    }

    /**
     * Get the Safe address
     */
    async getAddress(): Promise<Address> {
        this.ensureInitialized();
        return await this.protocolKit!.getAddress() as Address;
    }

    /**
     * Check if the Safe is deployed
     */
    async isSafeDeployed(): Promise<boolean> {
        this.ensureInitialized();
        return await this.protocolKit!.isSafeDeployed();
    }

    /**
     * Deploy the Safe
     * @returns Transaction hash and Safe address
     */
    async deploySafe(chainId: bigint): Promise<{ safeAddress: Address; txHash: Hex }> {
        this.ensureInitialized();

        const deploymentTransaction = await this.protocolKit!.createSafeDeploymentTransaction();

        const client = await this.protocolKit!.getSafeProvider().getExternalSigner();

        if (!client) {
            throw new Error('Failed to get signer client');
        }

        // Get chain for viem
        const { getChainConfig } = await import('../config.js');
        const chainConfig = getChainConfig(chainId);
        const { defineChain } = await import('viem');
        const customChain = defineChain({
            id: Number(chainId),
            name: chainConfig.name,
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: {
                default: { http: [chainConfig.rpcUrl] },
            },
        });

        const txHash = await client.sendTransaction({
            to: deploymentTransaction.to as Address,
            value: BigInt(deploymentTransaction.value),
            data: deploymentTransaction.data as Hex,
            chain: customChain,
        });

        // Wait for deployment using viem public client
        const { createPublicClient, http } = await import('viem');
        const publicClient = createPublicClient({
            chain: customChain,
            transport: http(chainConfig.rpcUrl),
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });

        // Get the Safe address
        const safeAddress = await this.getAddress();

        // Reconnect with the deployed Safe
        this.protocolKit = await this.protocolKit!.connect({ safeAddress });

        return { safeAddress, txHash };
    }

    /**
     * Build a Safe transaction for sending ETH
     */
    async buildETHTransferTx(to: Address, amountWei: bigint): Promise<SafeTransaction> {
        this.ensureInitialized();

        const txData: MetaTransactionData = {
            to,
            value: amountWei.toString(),
            data: '0x',
            operation: OperationType.Call,
        };

        return this.protocolKit!.createTransaction({ transactions: [txData] });
    }

    /**
     * Build a Safe transaction for sending ERC20 tokens
     */
    async buildERC20TransferTx(
        tokenAddress: Address,
        to: Address,
        amount: bigint
    ): Promise<SafeTransaction> {
        this.ensureInitialized();

        const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [to, amount],
        });

        const txData: MetaTransactionData = {
            to: tokenAddress,
            value: '0',
            data,
            operation: OperationType.Call,
        };

        return this.protocolKit!.createTransaction({ transactions: [txData] });
    }

    /**
     * Build a Safe transaction with raw calldata (for any contract interaction)
     */
    async buildRawTx(
        to: Address,
        value: bigint,
        data: `0x${string}`
    ): Promise<SafeTransaction> {
        this.ensureInitialized();

        const txData: MetaTransactionData = {
            to,
            value: value.toString(),
            data,
            operation: OperationType.Call,
        };

        return this.protocolKit!.createTransaction({ transactions: [txData] });
    }

    /**
     * Build a batched Safe transaction with multiple calls
     */
    async buildBatchTx(
        transactions: Array<{ to: Address; value: bigint; data: `0x${string}` }>
    ): Promise<SafeTransaction> {
        this.ensureInitialized();

        const txDataArray: MetaTransactionData[] = transactions.map(tx => ({
            to: tx.to,
            value: tx.value.toString(),
            data: tx.data,
            operation: OperationType.Call,
        }));

        return this.protocolKit!.createTransaction({ transactions: txDataArray });
    }

    /**
     * Get the transaction hash for a Safe transaction
     */
    async getTransactionHash(safeTx: SafeTransaction): Promise<Hex> {
        this.ensureInitialized();
        return await this.protocolKit!.getTransactionHash(safeTx) as Hex;
    }

    /**
     * Sign a Safe transaction hash
     */
    async signTransactionHash(safeTxHash: Hex): Promise<{ data: Hex }> {
        this.ensureInitialized();
        const signature = await this.protocolKit!.signHash(safeTxHash);
        return { data: signature.data as Hex };
    }

    /**
     * Execute a Safe transaction (when threshold is met)
     */
    async executeTransaction(safeTx: SafeTransaction): Promise<{ hash: Hex }> {
        this.ensureInitialized();
        const response = await this.protocolKit!.executeTransaction(safeTx);
        return { hash: response.hash as Hex };
    }

    /**
     * Execute a transaction from the Transaction Service response
     * This properly reconstructs the SafeTransaction with all collected signatures
     */
    async executeTransactionFromService(txResponse: SafeMultisigTransactionResponse): Promise<{ hash: Hex }> {
        this.ensureInitialized();

        // Create the transaction data
        const txData: MetaTransactionData = {
            to: txResponse.to,
            value: txResponse.value,
            data: txResponse.data || '0x',
            operation: txResponse.operation as OperationType,
        };

        // Create a SafeTransaction
        const safeTx = await this.protocolKit!.createTransaction({
            transactions: [txData],
            options: {
                safeTxGas: txResponse.safeTxGas?.toString(),
                baseGas: txResponse.baseGas?.toString(),
                gasPrice: txResponse.gasPrice?.toString(),
                gasToken: txResponse.gasToken,
                refundReceiver: txResponse.refundReceiver || undefined,
                nonce: txResponse.nonce,
            },
        });

        // Add all confirmations as signatures
        if (txResponse.confirmations && txResponse.confirmations.length > 0) {
            // Sort by owner address (Safe requires sorted signatures)
            const sortedConfirmations = [...txResponse.confirmations].sort((a, b) =>
                a.owner.toLowerCase().localeCompare(b.owner.toLowerCase())
            );

            for (const confirmation of sortedConfirmations) {
                safeTx.addSignature({
                    signer: confirmation.owner,
                    data: confirmation.signature as `0x${string}`,
                    isContractSignature: false,
                } as SafeSignature);
            }
        }

        // Execute
        const response = await this.protocolKit!.executeTransaction(safeTx);
        return { hash: response.hash as Hex };
    }

    /**
     * Get Safe info (owners, threshold, etc.)
     */
    async getSafeInfo(): Promise<{ owners: Address[]; threshold: number }> {
        this.ensureInitialized();
        const owners = await this.protocolKit!.getOwners() as Address[];
        const threshold = await this.protocolKit!.getThreshold();
        return { owners, threshold };
    }

    private ensureInitialized(): void {
        if (!this.protocolKit) {
            throw new Error('SafeService not initialized. Call initForDeployment() or initForExistingSafe() first.');
        }
    }
}
