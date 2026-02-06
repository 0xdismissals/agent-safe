import SafeApiKit from '@safe-global/api-kit';
import type { SafeMultisigTransactionResponse } from '@safe-global/types-kit';
import { type Address, type Hex } from 'viem';

export interface Confirmation {
    owner: Address;
    signature: Hex;
    submissionDate: string;
}

export interface TransactionDetails {
    safeTxHash: Hex;
    to: Address;
    value: string;
    data: Hex;
    confirmations: Confirmation[];
    confirmationsRequired: number;
    isExecuted: boolean;
    executionDate: string | null;
    transactionHash: Hex | null;
}

/**
 * SafeTxServiceClient handles interactions with the Safe Transaction Service API
 */
export class SafeTxServiceClient {
    private apiKit: SafeApiKit;

    constructor(chainId: bigint, txServiceUrl?: string) {
        const ApiKit = (SafeApiKit as any).default || SafeApiKit;
        this.apiKit = new ApiKit({
            chainId,
            txServiceUrl,
        });
    }

    /**
     * Propose a transaction to the Safe Transaction Service
     */
    async proposeTransaction(
        safeAddress: Address,
        safeTransactionData: {
            to: string;
            value: string;
            data: string;
            operation: number;
            safeTxGas: string;
            baseGas: string;
            gasPrice: string;
            gasToken: string;
            refundReceiver: string;
            nonce: number;
        },
        safeTxHash: Hex,
        senderAddress: Address,
        senderSignature: Hex
    ): Promise<void> {
        await this.apiKit.proposeTransaction({
            safeAddress,
            safeTransactionData,
            safeTxHash,
            senderAddress,
            senderSignature,
        });
    }

    /**
     * Get a transaction by its Safe transaction hash
     */
    async getTransaction(safeTxHash: Hex): Promise<SafeMultisigTransactionResponse> {
        return this.apiKit.getTransaction(safeTxHash);
    }

    /**
     * Get transaction details including confirmations
     */
    async getTransactionDetails(safeTxHash: Hex): Promise<TransactionDetails> {
        const tx = await this.getTransaction(safeTxHash);

        return {
            safeTxHash: tx.safeTxHash as Hex,
            to: tx.to as Address,
            value: tx.value,
            data: (tx.data || '0x') as Hex,
            confirmations: (tx.confirmations || []).map(c => ({
                owner: c.owner as Address,
                signature: c.signature as Hex,
                submissionDate: c.submissionDate,
            })),
            confirmationsRequired: tx.confirmationsRequired,
            isExecuted: tx.isExecuted,
            executionDate: tx.executionDate,
            transactionHash: tx.transactionHash as Hex | null,
        };
    }

    /**
     * Get pending transactions for a Safe
     */
    async getPendingTransactions(safeAddress: Address): Promise<SafeMultisigTransactionResponse[]> {
        const response = await this.apiKit.getPendingTransactions(safeAddress);
        return response.results;
    }

    /**
     * Confirm a transaction (add signature)
     */
    async confirmTransaction(safeTxHash: Hex, signature: Hex): Promise<void> {
        await this.apiKit.confirmTransaction(safeTxHash, signature);
    }

    /**
     * Get Safe info from the service
     */
    async getSafeInfo(safeAddress: Address) {
        return this.apiKit.getSafeInfo(safeAddress);
    }
}
