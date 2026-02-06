import { type Address, type Hex, encodeFunctionData, parseUnits, formatUnits, createPublicClient, http, defineChain } from 'viem';
import { type UniswapConfig, type TokenConfig } from '../types.js';
import { ERC20_ABI, WETH_ABI } from '../abis.js';

// ABIs for Uniswap V3 contracts
const QUOTER_V2_ABI = [
    {
        name: 'quoteExactInputSingle',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{
            name: 'params',
            type: 'tuple',
            components: [
                { name: 'tokenIn', type: 'address' },
                { name: 'tokenOut', type: 'address' },
                { name: 'amountIn', type: 'uint256' },
                { name: 'fee', type: 'uint24' },
                { name: 'sqrtPriceLimitX96', type: 'uint160' },
            ],
        }],
        outputs: [
            { name: 'amountOut', type: 'uint256' },
            { name: 'sqrtPriceX96After', type: 'uint160' },
            { name: 'initializedTicksCrossed', type: 'uint32' },
            { name: 'gasEstimate', type: 'uint256' },
        ],
    },
] as const;

const SWAP_ROUTER_ABI = [
    {
        name: 'exactInputSingle',
        type: 'function',
        stateMutability: 'payable',
        inputs: [{
            name: 'params',
            type: 'tuple',
            components: [
                { name: 'tokenIn', type: 'address' },
                { name: 'tokenOut', type: 'address' },
                { name: 'fee', type: 'uint24' },
                { name: 'recipient', type: 'address' },
                { name: 'amountIn', type: 'uint256' },
                { name: 'amountOutMinimum', type: 'uint256' },
                { name: 'sqrtPriceLimitX96', type: 'uint160' },
            ],
        }],
        outputs: [{ name: 'amountOut', type: 'uint256' }],
    },
] as const;

const FACTORY_ABI = [
    {
        name: 'getPool',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'fee', type: 'uint24' },
        ],
        outputs: [{ name: 'pool', type: 'address' }],
    },
] as const;

export interface SwapQuoteResult {
    fromToken: {
        symbol: string;
        address: Address;
        amount: string;
        amountRaw: string;
    };
    toToken: {
        symbol: string;
        address: Address;
        amount: string;
        amountMin: string;
        amountRaw: string;
        amountMinRaw: string;
    };
    poolFee: number;
    gasEstimate: string;
    priceImpact?: string;
}

export interface SwapParams {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    amountOutMinimum: bigint;
    recipient: Address;
    fee?: number;
}

/**
 * UniswapService handles Uniswap V3 quote and swap operations
 */
export class UniswapService {
    private client;
    private config: UniswapConfig;
    private tokens: TokenConfig[];
    private defaultSlippagePercent: number = 0.5;

    constructor(config: UniswapConfig, tokens: TokenConfig[], rpcUrl: string, chainId: bigint) {
        this.config = config;
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
     * Resolve token symbol to address and decimals
     */
    resolveToken(tokenSymbolOrAddress: string): { address: Address; decimals: number; symbol: string } {
        // Handle ETH specially - map to WETH
        if (tokenSymbolOrAddress.toUpperCase() === 'ETH') {
            return { address: this.config.weth, decimals: 18, symbol: 'ETH' };
        }

        // Check allowlist
        const token = this.tokens.find(
            t => t.symbol.toLowerCase() === tokenSymbolOrAddress.toLowerCase() ||
                t.address.toLowerCase() === tokenSymbolOrAddress.toLowerCase()
        );

        if (token) {
            return { address: token.address, decimals: token.decimals, symbol: token.symbol };
        }

        // Assume it's an address with 18 decimals
        return {
            address: tokenSymbolOrAddress as Address,
            decimals: 18,
            symbol: 'TOKEN',
        };
    }

    /**
     * Check if a pool exists for the given token pair
     */
    async getPool(tokenA: Address, tokenB: Address, fee: number = this.config.defaultPoolFee || 3000): Promise<Address | null> {
        try {
            const pool = await this.client.readContract({
                address: this.config.factory,
                abi: FACTORY_ABI,
                functionName: 'getPool',
                args: [tokenA, tokenB, fee],
            });

            // Zero address means no pool
            if (pool === '0x0000000000000000000000000000000000000000') {
                return null;
            }

            return pool as Address;
        } catch (error) {
            console.error('Error checking pool:', error);
            return null;
        }
    }

    /**
     * Get a quote for swapping tokens
     */
    async getQuote(
        fromToken: string,
        toToken: string,
        amount: string,
        fee: number = this.config.defaultPoolFee || 3000
    ): Promise<SwapQuoteResult> {
        const tokenIn = this.resolveToken(fromToken);
        const tokenOut = this.resolveToken(toToken);

        // Parse amount to raw units
        const amountInRaw = parseUnits(amount, tokenIn.decimals);

        // Check if pool exists
        const pool = await this.getPool(tokenIn.address, tokenOut.address, fee);
        if (!pool) {
            throw new Error(`No Uniswap pool exists for ${tokenIn.symbol}/${tokenOut.symbol} with fee ${fee / 10000}%`);
        }

        // Get quote using QuoterV2 (simulate call)
        try {
            const result = await this.client.simulateContract({
                address: this.config.quoterV2,
                abi: QUOTER_V2_ABI,
                functionName: 'quoteExactInputSingle',
                args: [{
                    tokenIn: tokenIn.address,
                    tokenOut: tokenOut.address,
                    amountIn: amountInRaw,
                    fee,
                    sqrtPriceLimitX96: 0n,
                }],
            });

            const [amountOut, , , gasEstimate] = result.result;

            // Calculate minimum output with slippage
            const slippageMultiplier = BigInt(Math.floor((100 - this.defaultSlippagePercent) * 100));
            const amountOutMin = (amountOut * slippageMultiplier) / 10000n;

            return {
                fromToken: {
                    symbol: tokenIn.symbol,
                    address: tokenIn.address,
                    amount,
                    amountRaw: amountInRaw.toString(),
                },
                toToken: {
                    symbol: tokenOut.symbol,
                    address: tokenOut.address,
                    amount: formatUnits(amountOut, tokenOut.decimals),
                    amountMin: formatUnits(amountOutMin, tokenOut.decimals),
                    amountRaw: amountOut.toString(),
                    amountMinRaw: amountOutMin.toString(),
                },
                poolFee: fee,
                gasEstimate: gasEstimate.toString(),
            };
        } catch (error: any) {
            // Handle specific errors
            if (error.message?.includes('SPL')) {
                throw new Error(`Swap would exceed price limits. Try a smaller amount.`);
            }
            throw new Error(`Failed to get quote: ${error.message}`);
        }
    }

    /**
     * Build calldata for the swap
     */
    buildSwapCalldata(params: SwapParams): Hex {
        return encodeFunctionData({
            abi: SWAP_ROUTER_ABI,
            functionName: 'exactInputSingle',
            args: [{
                tokenIn: params.tokenIn,
                tokenOut: params.tokenOut,
                fee: params.fee || this.config.defaultPoolFee || 3000,
                recipient: params.recipient,
                amountIn: params.amountIn,
                amountOutMinimum: params.amountOutMinimum,
                sqrtPriceLimitX96: 0n,
            }],
        });
    }

    /**
     * Check if the input token is ETH (native)
     */
    isNativeETH(tokenSymbolOrAddress: string): boolean {
        return tokenSymbolOrAddress.toUpperCase() === 'ETH';
    }

    /**
     * Get the swap router address
     */
    getSwapRouterAddress(): Address {
        return this.config.swapRouter;
    }

    /**
     * Build calldata for ERC20 approve (needed before swapping ERC20 tokens)
     */
    buildApproveCalldata(spender: Address, amount: bigint): Hex {
        return encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender, amount],
        });
    }

    /**
     * Build calldata for wrapping ETH to WETH
     * Call WETH.deposit() with ETH value
     */
    buildWrapCalldata(): Hex {
        return encodeFunctionData({
            abi: WETH_ABI,
            functionName: 'deposit',
        });
    }

    /**
     * Build calldata for unwrapping WETH to ETH
     * Call WETH.withdraw(amount)
     */
    buildUnwrapCalldata(amount: bigint): Hex {
        return encodeFunctionData({
            abi: WETH_ABI,
            functionName: 'withdraw',
            args: [amount],
        });
    }

    /**
     * Get WETH address
     */
    getWETHAddress(): Address {
        return this.config.weth;
    }
}
