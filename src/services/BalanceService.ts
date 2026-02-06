import { createPublicClient, http, formatUnits, type Address, defineChain } from 'viem';
import { type TokenConfig } from '../types.js';
import { ERC20_ABI } from '../abis.js';

export interface TokenBalance {
    symbol: string;
    address: Address;
    balance: string;
    balanceRaw: bigint;
    decimals: number;
}

export interface Balances {
    ethBalance: string;
    ethBalanceWei: bigint;
    tokens: TokenBalance[];
}

/**
 * BalanceService handles ETH and ERC20 balance queries
 */
export class BalanceService {
    private client;
    private tokens: TokenConfig[];

    constructor(rpcUrl: string, chainId: bigint, tokens: TokenConfig[]) {
        this.tokens = tokens;
        this.client = createPublicClient({
            chain: defineChain({
                id: Number(chainId),
                name: 'App Chain',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: {
                    default: { http: [rpcUrl] },
                },
            }),
            transport: http(rpcUrl),
        });
    }

    /**
     * Get ETH balance for an address
     */
    async getETHBalance(address: Address): Promise<{ balance: string; balanceWei: bigint }> {
        const balanceWei = await this.client.getBalance({ address });
        return {
            balance: formatUnits(balanceWei, 18),
            balanceWei,
        };
    }

    /**
     * Get balance for a single ERC20 token
     */
    async getTokenBalance(tokenAddress: Address, ownerAddress: Address, decimals: number = 18): Promise<bigint> {
        try {
            const balance = await this.client.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [ownerAddress],
            });
            return balance as bigint;
        } catch (error) {
            console.warn(`Failed to read balance for token ${tokenAddress}:`, error);
            return 0n;
        }
    }

    /**
     * Get all balances (ETH + allowlist tokens) for an address
     */
    async getBalances(address: Address): Promise<Balances> {
        // Get ETH balance
        const { balance: ethBalance, balanceWei: ethBalanceWei } = await this.getETHBalance(address);

        // Get token balances
        const tokenBalances: TokenBalance[] = [];

        for (const token of this.tokens) {
            const balanceRaw = await this.getTokenBalance(token.address, address, token.decimals);
            tokenBalances.push({
                symbol: token.symbol,
                address: token.address,
                balance: formatUnits(balanceRaw, token.decimals),
                balanceRaw,
                decimals: token.decimals,
            });
        }

        return {
            ethBalance,
            ethBalanceWei,
            tokens: tokenBalances,
        };
    }

    /**
     * Format balance summary as a string
     */
    formatBalanceSummary(balances: Balances): string {
        let summary = `ETH: ${balances.ethBalance}\n`;

        for (const token of balances.tokens) {
            if (token.balanceRaw > 0n) {
                summary += `${token.symbol}: ${token.balance}\n`;
            }
        }

        return summary.trim();
    }

    /**
     * Get token config by symbol
     */
    getTokenBySymbol(symbol: string): TokenConfig | undefined {
        return this.tokens.find(t => t.symbol.toLowerCase() === symbol.toLowerCase());
    }

    /**
     * Get token config by address
     */
    getTokenByAddress(address: Address): TokenConfig | undefined {
        return this.tokens.find(t => t.address.toLowerCase() === address.toLowerCase());
    }

    /**
     * Get the public client
     */
    getPublicClient() {
        return this.client;
    }
}
