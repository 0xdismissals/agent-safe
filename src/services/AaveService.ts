import { type Address, type Hex, encodeFunctionData, parseUnits, type PublicClient } from 'viem';
import { type AaveConfig, type TokenConfig } from '../types.js';

// Aave V3 Pool ABI (minimal for supply/withdraw)
const POOL_ABI = [
    {
        name: 'supply',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'asset', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'onBehalfOf', type: 'address' },
            { name: 'referralCode', type: 'uint16' },
        ],
        outputs: [],
    },
    {
        name: 'withdraw',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'asset', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'to', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const;

// ERC20 Approve ABI
const APPROVE_ABI = [
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
] as const;

// Aave Faucet ABI
const FAUCET_ABI = [
    {
        name: 'mint',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
    },
] as const;

/**
 * AaveService handles Aave V3 supply/withdraw operations
 */
export class AaveService {
    private config: AaveConfig;
    private tokens: TokenConfig[];
    private publicClient: PublicClient;

    constructor(config: AaveConfig, tokens: TokenConfig[], publicClient: PublicClient) {
        this.config = config;
        this.tokens = tokens;
        this.publicClient = publicClient;
    }

    /**
     * Resolve token symbol to address and decimals
     */
    async resolveToken(tokenSymbolOrAddress: string): Promise<{ address: Address; decimals: number; symbol: string }> {
        // Check allowlist
        const token = this.tokens.find(
            t => t.symbol.toLowerCase() === tokenSymbolOrAddress.toLowerCase() ||
                t.address.toLowerCase() === tokenSymbolOrAddress.toLowerCase()
        );

        if (token) {
            return { address: token.address, decimals: token.decimals, symbol: token.symbol };
        }

        // Validate if it's an address
        if (!tokenSymbolOrAddress.startsWith('0x')) {
            throw new Error(`Token ${tokenSymbolOrAddress} not found in allowlist and is not a valid address.`);
        }

        const address = tokenSymbolOrAddress as Address;

        // Fetch decimals on-chain
        try {
            const decimals = await this.publicClient.readContract({
                address,
                abi: [{ name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }],
                functionName: 'decimals',
            }) as number;

            return {
                address,
                decimals,
                symbol: 'TOKEN',
            };
        } catch (error) {
            console.error(`Failed to fetch decimals for ${address}:`, error);
            throw new Error(`Could not resolve decimals for token at ${address}. Please ensure it is a valid ERC20 token.`);
        }
    }

    /**
     * Build calldata for supplying (depositing) tokens to Aave
     */
    buildSupplyCalldata(asset: Address, amount: bigint, onBehalfOf: Address): Hex {
        return encodeFunctionData({
            abi: POOL_ABI,
            functionName: 'supply',
            args: [asset, amount, onBehalfOf, 0], // referralCode = 0
        });
    }

    /**
     * Build calldata for withdrawing tokens from Aave
     * Pass type(uint256).max to withdraw all (including interest)
     */
    buildWithdrawCalldata(asset: Address, amount: bigint, to: Address): Hex {
        return encodeFunctionData({
            abi: POOL_ABI,
            functionName: 'withdraw',
            args: [asset, amount, to],
        });
    }

    /**
     * Build calldata for ERC20 approve
     */
    buildApproveCalldata(spender: Address, amount: bigint): Hex {
        return encodeFunctionData({
            abi: APPROVE_ABI,
            functionName: 'approve',
            args: [spender, amount],
        });
    }

    /**
     * Get the Aave Pool contract address
     */
    getPoolAddress(): Address {
        return this.config.pool;
    }

    /**
     * Get the Aave Faucet contract address
     */
    getFaucetAddress(): Address {
        if (!this.config.faucet) {
            throw new Error('Aave Faucet not configured for this chain');
        }
        return this.config.faucet;
    }

    /**
     * Build calldata for minting tokens from the faucet
     */
    buildFaucetMintCalldata(token: Address, to: Address, amount: bigint): Hex {
        return encodeFunctionData({
            abi: FAUCET_ABI,
            functionName: 'mint',
            args: [token, to, amount],
        });
    }

    /**
     * Parse token amount to raw units
     */
    async parseAmount(amount: string, tokenSymbolOrAddress: string): Promise<bigint> {
        const token = await this.resolveToken(tokenSymbolOrAddress);
        return parseUnits(amount, token.decimals);
    }

    /**
     * Get max uint256 for withdrawing all balance
     */
    getMaxUint256(): bigint {
        return 2n ** 256n - 1n;
    }
}
