import { type Address } from 'viem';

export interface DefiLlamaPool {
    chain: string;
    project: string;
    symbol: string;
    tvlUsd: number;
    apyBase: number | null;
    apyReward: number | null;
    apy: number;
    rewardTokens: string[] | null;
    pool: string;
    apyPct1D: number | null;
    apyPct7D: number | null;
    apyPct30D: number | null;
    stablecoin: boolean;
    ilRisk: string;
    exposure: string;
    predictions: {
        predictedClass: string;
        predictedProbability: number;
        binnedConfidence: number;
    };
    poolMeta: string | null;
    mu: number;
    sigma: number;
    count: number;
    outlier: boolean;
    underlyingTokens: string[] | null;
    il7d: number | null;
    apyBase7d: number | null;
    apyMean30d: number | null;
    volumeUsd1d: number | null;
    volumeUsd7d: number | null;
    apyBaseInception: number | null;
}

export interface YieldSummary {
    symbol: string;
    project: string;
    apy: number;
    tvlUsd: number;
}

/**
 * YieldService handles fetching and filtering yield opportunities from DefiLlama
 */
export class YieldService {
    private readonly API_URL = 'https://yields.llama.fi/pools';

    /**
     * Fetch top yield opportunities for given tokens on a specific chain
     */
    async getYieldSummary(llamaChain: string, symbols: string[]): Promise<string> {
        try {
            console.log(`[YieldService] Fetching yields for ${llamaChain} (${symbols.join(', ')})`);
            const response = await fetch(this.API_URL);

            if (!response.ok) {
                throw new Error(`Failed to fetch yields: ${response.statusText}`);
            }

            const result = await response.json() as any;
            const pools: DefiLlamaPool[] = result.data;

            // Filter by chain and symbol
            const filteredPools = pools.filter(pool =>
                pool.chain.toLowerCase() === llamaChain.toLowerCase() &&
                symbols.some(s => pool.symbol.toLowerCase().includes(s.toLowerCase()))
            );

            // Sort by APY descending
            const sortedPools = filteredPools.sort((a, b) => b.apy - a.apy);

            // Take top 10 unique combinations of project + symbol
            const seen = new Set<string>();
            const topPools: DefiLlamaPool[] = [];

            for (const pool of sortedPools) {
                const key = `${pool.project}-${pool.symbol}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    topPools.push(pool);
                }
                if (topPools.length >= 10) break;
            }

            if (topPools.length === 0) {
                return `No high-yield pools found for ${symbols.join(', ')} on ${llamaChain} at this time.`;
            }

            let summary = `Top Yield Opportunities on ${llamaChain}:\n\n`;
            for (const pool of topPools) {
                summary += `- ${pool.symbol} @ ${pool.project}: ${pool.apy.toFixed(2)}% APY (TVL: $${(pool.tvlUsd / 1e6).toFixed(1)}M)\n`;
            }
            summary += `\nSource: DefiLlama`;

            return summary;
        } catch (error: any) {
            console.error(`[YieldService] Error:`, error.message);
            return `Failed to fetch yield data: ${error.message}`;
        }
    }
}
