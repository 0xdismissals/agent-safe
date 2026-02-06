import {
    createPublicClient,
    createWalletClient,
    http,
    formatEther,
    parseEther,
    type Address,
    type Hash,
    type Hex,
    type TransactionReceipt,
    type PublicClient,
    type WalletClient,
    defineChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * ChainRPCClient handles all RPC interactions with a network
 */
export class ChainRPCClient {
    private publicClient;
    private walletClient: WalletClient | null = null;
    private chainId: bigint;
    private rpcUrl: string;

    constructor(rpcUrl: string, chainId: bigint) {
        this.chainId = chainId;
        this.rpcUrl = rpcUrl;

        const chain = defineChain({
            id: Number(chainId),
            name: 'App Chain',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: {
                default: { http: [rpcUrl] },
            },
        });

        this.publicClient = createPublicClient({
            chain,
            transport: http(rpcUrl),
        });
    }

    /**
     * Initialize wallet client with a private key for transaction sending
     */
    initWalletClient(privateKey: Hex): void {
        const account = privateKeyToAccount(privateKey);
        const chain = defineChain({
            id: Number(this.chainId),
            name: 'App Chain',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: {
                default: { http: [this.rpcUrl] },
            },
        });

        this.walletClient = createWalletClient({
            account,
            chain,
            transport: http(this.rpcUrl),
        });
    }

    /**
     * Get the public client for read operations
     */
    getPublicClient() {
        return this.publicClient;
    }

    /**
     * Get ETH balance in wei
     */
    async getBalance(address: Address): Promise<bigint> {
        return this.publicClient.getBalance({ address });
    }

    /**
     * Get ETH balance formatted as string
     */
    async getBalanceFormatted(address: Address): Promise<string> {
        const balance = await this.getBalance(address);
        return formatEther(balance);
    }

    /**
     * Get contract code (to verify contract exists)
     */
    async getCode(address: Address): Promise<Hex | undefined> {
        return this.publicClient.getCode({ address });
    }

    /**
     * Check if an address is a contract
     */
    async isContract(address: Address): Promise<boolean> {
        const code = await this.getCode(address);
        return code !== undefined && code !== '0x';
    }

    /**
     * Get transaction receipt
     */
    async getTransactionReceipt(hash: Hash): Promise<TransactionReceipt> {
        return this.publicClient.getTransactionReceipt({ hash });
    }

    /**
     * Wait for transaction confirmation
     */
    async waitForTransaction(hash: Hash): Promise<TransactionReceipt> {
        return this.publicClient.waitForTransactionReceipt({ hash });
    }

    /**
     * Get current gas price
     */
    async getGasPrice(): Promise<bigint> {
        return this.publicClient.getGasPrice();
    }

    /**
     * Parse ETH string to wei
     */
    parseEther(value: string): bigint {
        return parseEther(value);
    }

    /**
     * Format wei to ETH string
     */
    formatEther(value: bigint): string {
        return formatEther(value);
    }
}
